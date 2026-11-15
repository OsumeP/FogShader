// =====================================================================
//  FOG SHADER - Faroles flotantes en la niebla
//  Niebla basada en profundidad (ver webglfundamentals: fog depth based)
// =====================================================================

// --- CONSTANTES DE LA ESCENA ---
const NUM_FAROLES = 60;
const Z_MIN = -2000;              // Farol más lejano
const Z_MAX = -100;               // Farol más cercano
const Z_FONDO = -2200;            // Plano de la imagen de fondo
const ESCALA_PROFUNDIDAD = 2600;  // Escala de la barra de rango (unidades)
const VIENTO_MAX = 10;            // Fuerza máxima del viento
const LIMITE_CULLING = 0.995;     // Factor de niebla a partir del cual no se dibuja

const VALORES_DEFECTO = {
  near: 150,
  far: 1500,
  densidad: 1.2,   // x 0.001 en el shader
  tone: 60,
  glow: 1.6,
  modo: 0          // 0 = lineal, 1 = exponencial, 2 = exponencial²
};

// --- ESTADO GLOBAL ---
let fogShader;
let boxImg;        // Textura del farol
let backImg;       // Imagen de fondo
let haloImg;       // Textura de halo generada por código

let ui = {};       // Referencias a elementos del DOM
let estado = {};   // Valores actuales de los controles (se actualizan en eventos 'input')
let faroles = [];

let eyeZ;          // Distancia de la cámara por defecto de p5 al origen
let viento = 0;
let ultimoMovimiento = -Infinity;
let instruccionVisible = true;
let farolesVisibles = 0;
let vientoMostrado = null;

function preload() {
  boxImg = loadImage("farol.png");
  backImg = loadImage("backimage.png");
}

function setup() {
  // Acoplamos el lienzo al contenedor HTML
  const canvas = createCanvas(800, 600, WEBGL);
  canvas.parent('canvas-container');
  noStroke();

  // Cámara por defecto de p5: FOV vertical de 60° mirando al origen
  eyeZ = (height / 2) / tan(PI / 6);

  fogShader = createShader(vert, frag);
  haloImg = crearTexturaHalo();

  configurarInterfaz();

  for (let i = 0; i < NUM_FAROLES; i++) {
    faroles.push(crearFarol(true));
  }
  ui.total.html(NUM_FAROLES);
}

function draw() {
  // Normalizamos el tiempo para que el movimiento no dependa de los FPS
  const dt = min(deltaTime, 50) / (1000 / 60);

  actualizarViento(dt);

  background(0);
  activarShaderNiebla();
  dibujarFondoPaisaje();
  procesarFlotaFaroles(dt);
}

// =====================================================================
//  INTERFAZ
// =====================================================================

/**
 * Obtiene los controles HTML y registra los eventos. Las etiquetas solo
 * se actualizan cuando un control cambia, no en cada frame.
 */
function configurarInterfaz() {
  ui.near = select('#near-slider');
  ui.far = select('#far-slider');
  ui.densidad = select('#densidad-slider');
  ui.tone = select('#tone-slider');
  ui.glow = select('#glow-slider');
  ui.modo = select('#modo-select');
  ui.debug = select('#debug-check');
  ui.volumen = select('#volumen-slider');

  ui.nearVal = select('#near-val');
  ui.farVal = select('#far-val');
  ui.densidadVal = select('#densidad-val');
  ui.toneVal = select('#tone-val');
  ui.glowVal = select('#glow-val');
  ui.volumenVal = select('#volumen-val');
  ui.rango = select('#rango-val');
  ui.visibles = select('#visibles-val');
  ui.total = select('#total-val');
  ui.vientoVal = select('#viento-val');
  ui.vientoRelleno = select('#viento-relleno');
  ui.instruccion = select('#instruccion');
  ui.leyendaDebug = select('#leyenda-debug');
  ui.grupoFar = select('#grupo-far');
  ui.grupoDensidad = select('#grupo-densidad');
  ui.rangoGradiente = select('#rango-gradiente');
  ui.rangoFaroles = select('#rango-faroles');
  ui.marcaNear = select('#marca-near');
  ui.marcaFar = select('#marca-far');
  ui.escalaMax = select('#escala-max');
  ui.audioBtn = select('#audio-btn');

  // Near y Far nunca se cruzan: el slider que se mueve empuja al otro
  ui.near.input(() => {
    const near = float(ui.near.value());
    if (near > float(ui.far.value()) - 10) ui.far.value(near + 10);
    leerControles();
  });
  ui.far.input(() => {
    const far = float(ui.far.value());
    if (far < float(ui.near.value()) + 10) ui.near.value(far - 10);
    leerControles();
  });

  ui.densidad.input(leerControles);
  ui.tone.input(leerControles);
  ui.glow.input(leerControles);
  ui.modo.changed(leerControles);
  ui.debug.changed(leerControles);

  select('#reset-btn').mousePressed(restablecerValores);

  ui.audioBtn.mousePressed(() => {
    const activo = AudioViento.alternar();
    ui.audioBtn.html(activo ? '🔇 Silenciar viento' : '🔊 Activar sonido de viento');
    ui.audioBtn.elt.classList.toggle('activo', activo);
  });
  ui.volumen.input(() => {
    const v = int(ui.volumen.value());
    ui.volumenVal.html(v);
    AudioViento.setVolumen(v / 100);
  });

  // Franja de profundidades en la que pueden existir faroles
  const inicio = (eyeZ - Z_MAX) / ESCALA_PROFUNDIDAD * 100;
  const fin = (eyeZ - Z_MIN) / ESCALA_PROFUNDIDAD * 100;
  ui.rangoFaroles.style('left', inicio + '%');
  ui.rangoFaroles.style('width', (fin - inicio) + '%');
  ui.escalaMax.html(ESCALA_PROFUNDIDAD);

  leerControles();
}

/** Lee todos los controles, actualiza etiquetas y la barra de rango. */
function leerControles() {
  estado.near = float(ui.near.value());
  estado.far = float(ui.far.value());
  estado.densidad = float(ui.densidad.value());
  estado.tone = float(ui.tone.value());
  estado.glow = float(ui.glow.value());
  estado.modo = int(ui.modo.value());
  estado.debug = ui.debug.elt.checked;

  // Mapeo cromático de la atmósfera nocturna: el tono controla el color
  // de la bruma y cuánto cubre la imagen de fondo
  const t = estado.tone / 255;
  estado.fogColor = [0.03 + 0.32 * t, 0.04 + 0.38 * t, 0.10 + 0.52 * t];
  estado.bruma = t * 0.65;

  ui.nearVal.html(estado.near);
  ui.farVal.html(estado.far);
  ui.densidadVal.html(estado.densidad.toFixed(1));
  ui.toneVal.html(estado.tone);
  ui.glowVal.html(estado.glow.toFixed(1));

  const lineal = estado.modo === 0;
  ui.grupoFar.elt.classList.toggle('inactivo', !lineal);
  ui.grupoDensidad.elt.classList.toggle('inactivo', lineal);
  ui.leyendaDebug.style('display', estado.debug ? 'block' : 'none');

  actualizarBarraRango();
}

/**
 * Dibuja en el panel cómo crece la niebla con la profundidad, usando
 * la misma fórmula que el shader.
 */
function actualizarBarraRango() {
  const pasos = 20;
  const paradas = [];
  for (let i = 0; i <= pasos; i++) {
    const p = i / pasos;
    const f = factorNiebla(p * ESCALA_PROFUNDIDAD);
    paradas.push(`rgba(150, 185, 235, ${f.toFixed(3)}) ${(p * 100).toFixed(1)}%`);
  }
  ui.rangoGradiente.style('background', `linear-gradient(90deg, ${paradas.join(', ')})`);

  const finEfectivo = distanciaNieblaTotal();
  ui.marcaNear.style('left', `calc(${estado.near / ESCALA_PROFUNDIDAD * 100}% - 1px)`);
  ui.marcaFar.style('left', `calc(${min(finEfectivo / ESCALA_PROFUNDIDAD, 1) * 100}% - 1px)`);

  if (estado.modo === 0) {
    ui.rango.html(`${estado.near} - ${estado.far}`);
  } else {
    ui.rango.html(`${estado.near} - ~${round(finEfectivo)} (99%)`);
  }
}

/** Devuelve todos los controles a sus valores iniciales. */
function restablecerValores() {
  ui.near.value(VALORES_DEFECTO.near);
  ui.far.value(VALORES_DEFECTO.far);
  ui.densidad.value(VALORES_DEFECTO.densidad);
  ui.tone.value(VALORES_DEFECTO.tone);
  ui.glow.value(VALORES_DEFECTO.glow);
  ui.modo.value(VALORES_DEFECTO.modo);
  ui.debug.elt.checked = false;
  leerControles();
}

function keyPressed() {
  if (key === 'd' || key === 'D') {
    ui.debug.elt.checked = !ui.debug.elt.checked;
    leerControles();
  }
}

// =====================================================================
//  NIEBLA (versión JS de la fórmula del shader)
// =====================================================================

/** Factor de niebla 0..1 para una distancia a la cámara. Igual que en el shader. */
function factorNiebla(d) {
  if (estado.modo === 0) {
    return constrain((d - estado.near) / (estado.far - estado.near), 0, 1);
  }
  const x = max(d - estado.near, 0) * estado.densidad * 0.001;
  return estado.modo === 1 ? 1 - exp(-x) : 1 - exp(-x * x);
}

/** Distancia a la que la niebla cubre por completo (99% en los modos exponenciales). */
function distanciaNieblaTotal() {
  if (estado.modo === 0) return estado.far;
  const k = estado.densidad * 0.001;
  const ln100 = Math.log(100);
  return estado.near + (estado.modo === 1 ? ln100 / k : Math.sqrt(ln100) / k);
}

// =====================================================================
//  VIENTO
// =====================================================================

/**
 * El movimiento horizontal del mouse sobre el lienzo acumula viento,
 * que decae solo cuando el mouse se queda quieto.
 */
function actualizarViento(dt) {
  const sobreCanvas = mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height;
  const dx = sobreCanvas ? constrain(mouseX - pmouseX, -60, 60) : 0;

  if (dx !== 0) ultimoMovimiento = millis();

  viento += dx * 0.035;
  viento *= pow(0.965, dt);
  viento = constrain(viento, -VIENTO_MAX, VIENTO_MAX);
  if (abs(viento) < 0.01) viento = 0;

  // La instrucción se oculta al mover el mouse y vuelve tras 8 s de calma
  const mostrar = millis() - ultimoMovimiento > 8000 && viento === 0;
  if (mostrar !== instruccionVisible) {
    instruccionVisible = mostrar;
    ui.instruccion.elt.classList.toggle('oculta', !mostrar);
  }

  // Indicador del panel (solo se toca el DOM si cambió el valor mostrado)
  const redondeado = Math.round(viento * 10) / 10;
  if (redondeado !== vientoMostrado) {
    vientoMostrado = redondeado;
    const pct = abs(viento) / VIENTO_MAX * 50;
    ui.vientoRelleno.style('width', pct + '%');
    ui.vientoRelleno.style('left', (viento < 0 ? 50 - pct : 50) + '%');
    if (redondeado === 0) {
      ui.vientoVal.html('sin viento');
    } else {
      ui.vientoVal.html((viento < 0 ? '← ' : '→ ') + abs(redondeado).toFixed(1));
    }
  }

  const turbulencia = noise(millis() * 0.0006);
  AudioViento.actualizar(viento, VIENTO_MAX, turbulencia);
}

// =====================================================================
//  RENDERIZADO
// =====================================================================

/** Configura y activa el shader de niebla con los uniformes del frame. */
function activarShaderNiebla() {
  shader(fogShader);
  fogShader.setUniform('uNear', estado.near);
  fogShader.setUniform('uFar', estado.far);
  fogShader.setUniform('uDensity', estado.densidad * 0.001);
  fogShader.setUniform('uFogMode', estado.modo);
  fogShader.setUniform('uFogColor', estado.fogColor);
  fogShader.setUniform('uHaze', estado.bruma);
  fogShader.setUniform('uGlow', estado.glow);
  fogShader.setUniform('uTime', millis() / 1000);
  fogShader.setUniform('uDebug', estado.debug ? 1 : 0);
  fogShader.setUniform('uResolution', [width * pixelDensity(), height * pixelDensity()]);
  fogShader.setUniform('uBackdrop', backImg);
  fogShader.setUniform('uBackdropSize', [backImg.width, backImg.height]);
}

/**
 * Dibuja el fondo con el mismo shader: un plano que llena la vista en
 * Z_FONDO. El shader lo pinta en coordenadas de pantalla, así los faroles
 * se funden exactamente con el píxel de fondo que tienen detrás.
 */
function dibujarFondoPaisaje() {
  const distancia = eyeZ - Z_FONDO;
  const alto = distancia * height / eyeZ * 1.05;
  const ancho = alto * width / height;

  fogShader.setUniform('uMode', 0);
  push();
  translate(0, 0, Z_FONDO);
  texture(backImg);
  plane(ancho, alto);
  pop();
}

/**
 * Actualiza la física de cada farol, dibuja los visibles y después
 * sus halos de luz en una segunda pasada aditiva.
 */
function procesarFlotaFaroles(dt) {
  const visibles = [];

  for (const f of faroles) {
    actualizarFisicasFarol(f, dt);

    // Si la niebla lo cubre por completo no vale la pena dibujarlo
    const distancia = eyeZ - f.z - f.w / 2;
    if (factorNiebla(distancia) < LIMITE_CULLING) visibles.push(f);
  }

  fogShader.setUniform('uMode', 1);
  for (const f of visibles) renderizarFarol(f);

  if (!estado.debug) renderizarHalos(visibles);

  farolesVisibles = visibles.length;
  if (frameCount % 10 === 0) ui.visibles.html(farolesVisibles);
}

/** Matriz de transformación, rotaciones y textura de un farol individual. */
function renderizarFarol(f) {
  push();
  translate(f.x, f.y, f.z);
  rotateZ(f.inclinacion + sin(frameCount * 0.01 + f.semilla) * 0.03);
  rotateY(f.rotY);

  fogShader.setUniform('uSeed', f.semilla);
  texture(boxImg);
  box(f.w, f.h, f.w);
  pop();
}

/**
 * Halo de luz cálida alrededor de cada farol. Se mezcla en modo aditivo
 * y sin escribir profundidad para que la luz se difumine en la niebla.
 */
function renderizarHalos(lista) {
  const gl = drawingContext;
  fogShader.setUniform('uMode', 2);
  blendMode(ADD);
  gl.depthMask(false);

  for (const f of lista) {
    push();
    translate(f.x, f.y, f.z);
    fogShader.setUniform('uSeed', f.semilla);
    texture(haloImg);
    plane(f.w * 4, f.w * 4);
    pop();
  }

  gl.depthMask(true);
  blendMode(BLEND);
}

/** Genera una textura de degradado radial para el halo. */
function crearTexturaHalo() {
  const tam = 128;
  const g = createGraphics(tam, tam);
  g.pixelDensity(1);
  const ctx = g.drawingContext;
  const grad = ctx.createRadialGradient(tam / 2, tam / 2, 0, tam / 2, tam / 2, tam / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, tam, tam);
  return g;
}

// =====================================================================
//  FAROLES
// =====================================================================

/** Mitad del ancho y alto visibles en una profundidad z del mundo. */
function mitadVisible(z) {
  const h = (eyeZ - z) * (height / 2) / eyeZ;
  return { w: h * width / height, h };
}

/**
 * Crea un farol. Al inicio se reparten por toda la pantalla; al
 * reaparecer nacen justo debajo del borde inferior visible.
 */
function crearFarol(inicial) {
  const z = random(Z_MIN, Z_MAX);
  const m = mitadVisible(z);
  const w = random(30, 45);
  const h = w * random(1.35, 1.6);
  const baseVx = random(-0.3, 0.3);

  return {
    x: random(-m.w, m.w),
    y: inicial ? random(-m.h, m.h + 200) : m.h + h + random(0, 250),
    z,
    w,
    h,
    speedY: random(1.5, 2.2),           // Velocidad de ascenso
    baseVx,                             // Deriva lateral propia
    vx: baseVx,
    respuesta: random(0.7, 1.3) * (40 / w), // Los faroles pequeños se mueven más con el viento
    inclinacion: 0,
    rotY: random(TWO_PI),
    giro: random(-0.004, 0.004),
    semilla: random(1000)
  };
}

/** Movimiento, efecto del viento y reaparición al salir de la vista. */
function actualizarFisicasFarol(f, dt) {
  // La velocidad lateral tiende a la deriva propia + el empuje del viento
  const objetivo = f.baseVx + viento * f.respuesta;
  f.vx = lerp(f.vx, objetivo, min(1, 0.04 * dt));

  f.x += f.vx * dt;
  f.y -= f.speedY * dt;
  f.rotY += f.giro * dt;

  // Se inclina en la dirección en la que lo empuja el viento
  const inclinacionObjetivo = constrain((f.vx - f.baseVx) * 0.06, -0.5, 0.5);
  f.inclinacion = lerp(f.inclinacion, inclinacionObjetivo, min(1, 0.08 * dt));

  const m = mitadVisible(f.z);
  const margen = f.w * 2;

  // Salió por arriba: renace abajo
  if (f.y < -m.h - margen) {
    Object.assign(f, crearFarol(false));
    return;
  }

  // Salió por un lado: entra por el contrario para no vaciar la escena
  if (f.x > m.w + margen) f.x = -m.w - margen;
  else if (f.x < -m.w - margen) f.x = m.w + margen;
}

// =====================================================================
//  SHADERS
// =====================================================================

const vert = `
precision mediump float;

attribute vec3 aPosition;
attribute vec2 aTexCoord;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
varying float vDepth;
varying vec2 vTexCoord;

void main() {
  vec4 viewModelPosition = uModelViewMatrix * vec4(aPosition, 1.0);
  vDepth = -viewModelPosition.z;      // Distancia a la cámara
  vTexCoord = aTexCoord;
  gl_Position = uProjectionMatrix * viewModelPosition;
}
`;

const frag = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying float vDepth;
varying vec2 vTexCoord;

uniform sampler2D uSampler;     // Textura del objeto actual
uniform sampler2D uBackdrop;    // Imagen de fondo
uniform vec2 uBackdropSize;
uniform vec2 uResolution;

uniform vec3 uFogColor;
uniform float uHaze;            // Cuánto cubre la bruma la imagen de fondo
uniform float uNear;
uniform float uFar;
uniform float uDensity;
uniform float uFogMode;         // 0 lineal, 1 exponencial, 2 exponencial²

uniform float uGlow;
uniform float uTime;
uniform float uSeed;
uniform float uMode;            // 0 fondo, 1 farol, 2 halo
uniform float uDebug;

// Factor de niebla 0..1 según la distancia a la cámara
float fogFactor(float d) {
  if (uFogMode < 0.5) {
    return clamp((d - uNear) / (uFar - uNear), 0.0, 1.0);
  }
  float x = max(d - uNear, 0.0) * uDensity;
  if (uFogMode < 1.5) {
    return 1.0 - exp(-x);
  }
  return 1.0 - exp(-x * x);
}

// Color de la atmósfera en este píxel: la imagen de fondo (ajustada tipo
// "cover" a la pantalla) cubierta por la bruma nocturna
vec3 atmosphereColor() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  uv.y = 1.0 - uv.y;
  float screenAspect = uResolution.x / uResolution.y;
  float imageAspect = uBackdropSize.x / uBackdropSize.y;
  if (imageAspect > screenAspect) {
    uv.x = 0.5 + (uv.x - 0.5) * screenAspect / imageAspect;
  } else {
    uv.y = 0.5 + (uv.y - 0.5) * imageAspect / screenAspect;
  }
  vec3 backdrop = texture2D(uBackdrop, uv).rgb;
  return mix(backdrop, uFogColor, uHaze);
}

// Parpadeo suave del fuego, distinto para cada farol
float flicker() {
  return 0.9 + 0.1 * sin(uTime * 7.0 + uSeed) * sin(uTime * 13.3 + uSeed * 1.7);
}

void main() {
  // --- Fondo ---
  if (uMode < 0.5) {
    if (uDebug > 0.5) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
      gl_FragColor = vec4(atmosphereColor(), 1.0);
    }
    return;
  }

  vec4 texColor = texture2D(uSampler, vTexCoord);
  float fog = fogFactor(vDepth);

  // --- Halo de luz (mezcla aditiva) ---
  if (uMode > 1.5) {
    float strength = 0.55 * flicker() * clamp(uGlow / 1.6, 0.3, 2.0);
    float alpha = texColor.a * (1.0 - fog) * strength;
    gl_FragColor = vec4(1.0, 0.62, 0.28, alpha);
    return;
  }

  // --- Farol ---
  if (texColor.a < 0.1) {
    discard;
  }

  if (uDebug > 0.5) {
    // Blanco = sin niebla, negro = niebla total
    gl_FragColor = vec4(vec3(1.0 - fog), 1.0);
    return;
  }

  // 1. Intensificamos el color cálido de farol.png para simular fuego interno
  vec3 emissive = texColor.rgb * uGlow * flicker();
  // 2. Tone mapping: comprime los valores altos en vez de saturarlos a blanco
  emissive = vec3(1.0) - exp(-emissive * 1.25);

  // 3. Mezclamos el farol con la atmósfera que tiene detrás según la niebla
  vec3 finalColor = mix(emissive, atmosphereColor(), fog);
  gl_FragColor = vec4(finalColor, texColor.a);
}
`;

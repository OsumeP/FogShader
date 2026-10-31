
let fogShader;
let sliders = {};
let labels = {};
let faroles = []; 

function preload() {
  boxImg = loadImage("farol.png"); 
  backImg = loadImage("backimage.png");
}

function setup() {
  // Acoplamos el lienzo al contenedor HTML
  const canvas = createCanvas(800, 600, WEBGL);
  canvas.parent('canvas-container');
  noStroke();
  
  // Inicializamos el shader 
  fogShader = createShader(vert, frag);

  // Vinculamos las variables a los controles reales del HTML
  sliders.near = select('#near-slider');
  sliders.far = select('#far-slider');
  sliders.fogTone = select('#tone-slider');
  
  labels.near = select('#near-val');
  labels.far = select('#far-val');
  labels.tone = select('#tone-val');
  labels.rango = select('#rango-val'); 



  // Inicializar faroles flotantes (abajo y subiendo)
  for (let i = 0; i < 60; i++) {
    faroles.push({
      x: random(-600, 600),
      y: random(100, 300),      // Comienzan abajo
      z: random(-2000, -100),    // Distribuidos en profundidad
      speedY: random(1.5, 2.0),  // Velocidad de ascenso al cielo
      speedX: random(-0.5, 0.0), // Leve balanceo lateral hacia los lados
      
      sizeW: random(15, 25),     // Ancho del farol
      sizeH: random(25, 40),     // Alto del farol
      
      // Tonos cálidos/anaranjados del fuego interior
      color: [random(240, 255), random(140, 190), random(30, 70)] 
    });
  }
}

function draw() {
  // 1. Gestión de datos e interfaz
  let config = actualizarInterfazYVariables();

  // 2. Renderizado del escenario de fondo
  dibujarFondoPaisaje(config.toneVal);

  // 3. Renderizado y simulación del mundo 3D
  activarShaderNiebla(config);
  procesarFlotaFaroles(config);
}

// --- FUNCIONES DE SOPORTE ---

/**
 * Lee los controles HTML, valida las reglas del rango de niebla y actualiza las etiquetas.
 */
function actualizarInterfazYVariables() {
  let nearVal = float(sliders.near.value());
  let farVal = float(sliders.far.value());
  let toneVal = float(sliders.fogTone.value());

  // Validación lógica del rango
  if (nearVal >= farVal) {
    nearVal = farVal - 10;
  }

  // Mapeo cromático de la atmósfera nocturna
  let rTone = (toneVal / 255) * 0.08;
  let gTone = (toneVal / 255) * 0.10;
  let bTone = (toneVal / 255) * 0.25;

  // Actualización de textos en el HTML
  labels.near.html(nearVal);
  labels.far.html(farVal);
  labels.tone.html(toneVal);
  labels.rango.html("desde " + nearVal + " hasta " + farVal);

  // Retornamos un objeto con todos los datos procesados listos para usar
  return { nearVal, farVal, toneVal, fogColor: [rTone, gTone, bTone] };
}

/**
 * Limpia el lienzo y dibuja la imagen del cielo/montañas en el fondo profundo.
 */
function dibujarFondoPaisaje(toneVal) {
  // Ajustamos el fondo del lienzo con el tono armónico
  background(toneVal * 0.08, toneVal * 0.10, toneVal * 0.25);

  push();
  resetShader(); // Desactivamos el shader para que el fondo no se opaque
  translate(0, 0, -2200); 
  texture(backImg); 
  plane(4200, 3500); 
  pop();
}

/**
 * Configura y activa el Shader de niebla con los uniformes actuales.
 */
function activarShaderNiebla(config) {
  shader(fogShader);
  fogShader.setUniform('uNear', config.nearVal);
  fogShader.setUniform('uFar', config.farVal);
  fogShader.setUniform('uFogColor', config.fogColor);
}

/**
 * Recorre la flota de faroles para actualizar su movimiento físico y dibujarlos en pantalla.
 */
function procesarFlotaFaroles(config) {
  for (let f of faroles) {
    // 1. Dibujar e ilustrar el farol en su posición actual
    renderizarFarol(f);

    // 2. Aplicar las leyes físicas de movimiento y reaparición
    actualizarFisicasFarol(f);
  }
}

/**
 * Maneja la matriz de transformación 3D, rotaciones y texturizado de un farol individual.
 */
function renderizarFarol(f) {
  push();
  // Perspectiva extra basada en la profundidad Z
  let factorCercania = map(f.z, -2000, -100, 0.5, 3.0);
  let anchoFinal = f.sizeW * 1.2 * factorCercania;
  let altoFinal = f.sizeH * factorCercania;

  translate(f.x, f.y, f.z);
  
  // Balanceo y rotación sutil
  rotateY(f.x * 0.01 + frameCount * 0.002);
  rotateZ(sin(frameCount * 0.01 + f.y) * 0.03);
  
  texture(boxImg); 
  box(anchoFinal, altoFinal, anchoFinal); 
  pop();
}

/**
 * Controla el desplazamiento del farol en el espacio y su reinicio al salir de la pantalla.
 */
function actualizarFisicasFarol(f) {
  f.y -= f.speedY;
  f.x += f.speedX;

  // Límite de reaparición (Techo de la pantalla)
  if (f.y < -600) {
    f.y = random(400, 550); // Renace en el plano inferior del río
    f.x = random(-1100, 1100); 
    f.z = random(-2000, -100);
  }
}


// --- SHADERS  ---

const vert = `
precision mediump float; // Definimos la precisión obligatoria

attribute vec3 aPosition;
attribute vec2 aTexCoord; 
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
varying float vDepth;
varying vec2 vTexCoord;

void main() {
 vec4 viewModelPosition = uModelViewMatrix * vec4(aPosition, 1.0);
 vDepth = -viewModelPosition.z;
 vTexCoord = aTexCoord; 
 gl_Position = uProjectionMatrix * viewModelPosition;
}
`;

const frag = `
precision mediump float;
varying float vDepth;
varying vec2 vTexCoord;

uniform sampler2D uSampler; 
uniform vec3 uFogColor;
uniform float uNear;
uniform float uFar;

void main() {
 vec4 texColor = texture2D(uSampler, vTexCoord);
 
 if (texColor.a < 0.1) {
   discard;
 }
 
 // 1. Intensificamos el color cálido/dorado natural de tu textura farol.png
 // Multiplicamos por 1.6 para forzar una emisión que simule fuego interno
 vec3 emisiveColor = texColor.rgb * 1.6; 
 
 // 2. Calculamos la niebla estándar basada en la distancia
 float fogFactor = clamp((vDepth - uNear) / (uFar - uNear), 0.0, 1.0);
 
 // 3. Mezclamos el farol encendido con el color de la atmósfera nocturna
 vec3 finalColor = mix(emisiveColor, uFogColor, fogFactor);
 gl_FragColor = vec4(finalColor, texColor.a);
}
`;

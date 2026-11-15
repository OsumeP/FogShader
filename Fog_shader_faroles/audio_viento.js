// --- SONIDO DE VIENTO (Web Audio API, sin archivos externos) ---
//
// Cadena de audio:
//   ruido rosado (buffer en bucle) -> filtro pasa-banda -> ganancia (ráfaga)
//   -> paneo estéreo (dirección del viento) -> volumen maestro -> salida
//
// Los navegadores bloquean el audio hasta que el usuario interactúa,
// por eso el contexto se crea al pulsar el botón "Activar sonido".

const AudioViento = {
  ctx: null,
  filtro: null,
  rafaga: null,
  paneo: null,
  maestro: null,
  activo: false,
  volumen: 0.7,

  /** Crea el grafo de audio la primera vez que se activa. */
  iniciar() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;

    this.ctx = new AC();

    // Buffer de 3 s de ruido rosado (más suave y "natural" que el ruido blanco)
    const duracion = 3;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * duracion, this.ctx.sampleRate);
    const datos = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < datos.length; i++) {
      const blanco = Math.random() * 2 - 1;
      // Filtro de Paul Kellet para aproximar ruido rosado
      b0 = 0.99886 * b0 + blanco * 0.0555179;
      b1 = 0.99332 * b1 + blanco * 0.0750759;
      b2 = 0.96900 * b2 + blanco * 0.1538520;
      b3 = 0.86650 * b3 + blanco * 0.3104856;
      b4 = 0.55000 * b4 + blanco * 0.5329522;
      b5 = -0.7616 * b5 - blanco * 0.0168980;
      datos[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + blanco * 0.5362) * 0.11;
      b6 = blanco * 0.115926;
    }

    const fuente = this.ctx.createBufferSource();
    fuente.buffer = buffer;
    fuente.loop = true;

    this.filtro = this.ctx.createBiquadFilter();
    this.filtro.type = 'bandpass';
    this.filtro.frequency.value = 350;
    this.filtro.Q.value = 0.9;

    this.rafaga = this.ctx.createGain();
    this.rafaga.gain.value = 0;

    this.maestro = this.ctx.createGain();
    this.maestro.gain.value = this.volumen;

    // StereoPanner no existe en algunos navegadores antiguos (Safari < 14.1)
    let ultimo = this.rafaga;
    if (this.ctx.createStereoPanner) {
      this.paneo = this.ctx.createStereoPanner();
      this.rafaga.connect(this.paneo);
      ultimo = this.paneo;
    }

    fuente.connect(this.filtro);
    this.filtro.connect(this.rafaga);
    ultimo.connect(this.maestro);
    this.maestro.connect(this.ctx.destination);
    fuente.start();
    return true;
  },

  /** Activa / silencia el sonido. Devuelve el nuevo estado. */
  alternar() {
    if (!this.ctx && !this.iniciar()) return false;

    this.activo = !this.activo;
    if (this.activo) {
      this.ctx.resume();
    } else {
      this.ctx.suspend();
    }
    return this.activo;
  },

  /** Volumen maestro en rango 0..1 */
  setVolumen(v) {
    this.volumen = v;
    if (this.maestro) {
      this.maestro.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    }
  },

  /**
   * Actualiza el sonido según el viento actual.
   * @param {number} viento  fuerza con signo (negativo = hacia la izquierda)
   * @param {number} vientoMax  valor máximo posible de |viento|
   * @param {number} turbulencia  0..1, variación lenta para simular ráfagas
   */
  actualizar(viento, vientoMax, turbulencia) {
    if (!this.activo) return;

    const t = this.ctx.currentTime;
    const fuerza = Math.min(Math.abs(viento) / vientoMax, 1);

    // Sin viento queda un murmullo casi imperceptible; con viento, un soplido
    const ganancia = 0.04 + fuerza * 0.9 * (0.75 + 0.25 * turbulencia);
    // El viento fuerte "silba" más agudo
    const frecuencia = 300 + fuerza * 1100 + turbulencia * 150;

    this.rafaga.gain.setTargetAtTime(ganancia, t, 0.12);
    this.filtro.frequency.setTargetAtTime(frecuencia, t, 0.15);
    if (this.paneo) {
      const pan = Math.max(-1, Math.min(1, viento / vientoMax)) * 0.8;
      this.paneo.pan.setTargetAtTime(pan, t, 0.2);
    }
  }
};

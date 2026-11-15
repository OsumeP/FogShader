# Fog Shader — Faroles en la niebla

Escena en p5.js (WEBGL) con faroles flotantes que suben y se pierden en una niebla calculada por profundidad en un shader GLSL. Está basada en el artículo [WebGL Fog (depth based)](https://webglfundamentals.org/webgl/webgl-3d-fog-depth-based-gl_FragCoord.html).

## Ejecutar
1. Abrir **Processing** en modo **p5.js** y abrir el sketch `Fog_shader_faroles`.
2. Pulsar **Run**. Processing levanta un servidor local y abre el navegador.

Otra opción es servir la carpeta con cualquier servidor HTTP (por ejemplo `python -m http.server`) y abrir `index.html`. Abrir el archivo directamente con `file://` no funciona porque el navegador bloquea la carga de las imágenes.

## Controles
| Control | Efecto |
|---|---|
| Tipo de niebla | Lineal (Near → Far), Exponencial o Exponencial² |
| Fog Near | Distancia a la que empieza la niebla |
| Fog Far | Distancia a la que la niebla cubre por completo (modo lineal) |
| Densidad | Qué tan rápido crece la niebla (modos exponenciales) |
| Fog Tone | Color y cantidad de bruma nocturna sobre el fondo |
| Brillo farol | Intensidad del fuego de los faroles y de su halo |
| Modo debug / tecla **D** | Muestra el factor de niebla: blanco = sin niebla, negro = niebla total |
| Mover el mouse sobre la escena | Genera viento hacia la izquierda o la derecha |
| Activar sonido / Volumen | Sonido de viento sintetizado que sigue la fuerza y dirección del viento |

## Cómo funciona el shader
* **Vértices:** se calcula `vDepth = -(ModelView * posición).z`, la distancia del vértice a la cámara.
* **Fragmentos:**
  1. `fogFactor(vDepth)`:
     * lineal: `clamp((d - near) / (far - near), 0, 1)`
     * exponencial: `1 - exp(-densidad · (d - near))`
     * exponencial²: `1 - exp(-(densidad · (d - near))²)`
  2. El color del farol se intensifica (`textura · brillo · parpadeo`) y se comprime con tone mapping (`1 - exp(-c)`), para que no se sature a blanco.
  3. El color de la atmósfera es el píxel de la imagen de fondo que hay detrás (muestreado con `gl_FragCoord`) mezclado con el tono de la bruma. El farol se mezcla con ese color según el factor de niebla, así que al llegar a Far desaparece dentro del paisaje.
  4. Los halos se dibujan en una segunda pasada con mezcla aditiva y se atenúan con `(1 - fogFactor)`.

## Archivos
* `Fog_shader_faroles.js`: escena, interfaz, viento y shaders
* `audio_viento.js`: sonido de viento con Web Audio API
* `index.html`: panel de control y lienzo
* `farol.png`, `backimage.png`: texturas

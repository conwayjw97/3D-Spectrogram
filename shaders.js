export const vertexShader = `
  uniform sampler2D u_audioTexture;
  uniform float u_writeIndex;   // Receives the normalized write position (0.0 to 1.0)
  uniform float u_timeSamples;  // Receives the total grid dimension size to fix edge mirror errors
  varying vec2 vUv;
  varying float vElevation;     // Declared to pass height data to the fragment shader

  void main() {
    vUv = uv;

    // Scale uv.y down slightly so the final row falls on discrete pixel boundaries instead of a clean 1.0 loop
    float correctedY = (uv.y * (u_timeSamples - 1.0)) / u_timeSamples;

    // Shift the texture lookup dynamically so the newest data lines up with the front edge safely
    vec2 circularUv = vec2(uv.x, mod(u_writeIndex - correctedY, 1.0));

    // Sample data texture using our corrected wrap-around UV coordinate
    vec4 audioColor = texture2D(u_audioTexture, circularUv);
    
    // Extrapolate height displacement matching your original scalar properties
    float displacement = audioColor.r * 25.0;
    
    // Assign displacement to the varying variable for the fragment shader
    vElevation = displacement;

    // Displace vertex height along the local Y axis (upwards after rotation)
    vec3 displacedPosition = position;
    displacedPosition.y += displacement;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
  }
`;

export const solidFragmentShader = `
  varying float vElevation;

  void main() {
    float intensity = clamp(vElevation / 25.0, 0.0, 1.0);
    
    vec3 colorDarkGreen = vec3(0.0, 0.25, 0.0);  
    vec3 colorNeonGreen = vec3(0.0, 1.0, 0.0);  
    vec3 colorYellow    = vec3(1.0, 1.0, 0.0);  
    vec3 colorRed       = vec3(1.0, 0.0, 0.0);  
    
    vec3 colour;
    if (intensity < 0.33) {
      colour = mix(colorDarkGreen, colorNeonGreen, intensity / 0.33);
    } else if (intensity < 0.66) {
      colour = mix(colorNeonGreen, colorYellow, (intensity - 0.33) / 0.33);
    } else {
      colour = mix(colorYellow, colorRed, (intensity - 0.66) / 0.34);
    }
    
    gl_FragColor = vec4(colour, 1.0);
  }
`;

export const wireFragmentShader = `
  uniform float u_opacity;

  void main() { 
      gl_FragColor = vec4(0.0, 0.0, 0.0, u_opacity); 
  }
`;
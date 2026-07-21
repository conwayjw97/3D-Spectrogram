import * as THREE from 'three';

export const COLOUR_SCHEMES = {
  standard: {
    // Standard: Dark Green -> Neon Green -> Yellow -> Red
    base: new THREE.Color(0.0, 0.25, 0.0),
    low:  new THREE.Color(0.0, 1.0, 0.0),
    mid:  new THREE.Color(1.0, 1.0, 0.0),
    high: new THREE.Color(1.0, 0.0, 0.0)
  },
  synthwave: {
    // Synthwave: Neon Purple -> Pink -> Orange -> Yellow
    base: new THREE.Color(0.2, 0.0, 0.4),
    low:  new THREE.Color(0.9, 0.1, 0.5),
    mid:  new THREE.Color(1.0, 0.5, 0.0),
    high: new THREE.Color(1.0, 0.9, 0.2)
  },
  glacier: {
    // Glacier: Deep Blue -> Electric Cyan -> White
    base: new THREE.Color(0.0, 0.1, 0.4),
    low:  new THREE.Color(0.0, 0.567, 0.733),
    mid:  new THREE.Color(0.333, 0.867, 0.933),
    high: new THREE.Color(1.0, 1.0, 1.0)
  },
  magma: {
    // Magma: Dark Red -> Fiery Orange -> Bright Yellow
    base: new THREE.Color(0.3, 0.0, 0.0),
    low:  new THREE.Color(0.7, 0.2, 0.0),
    mid:  new THREE.Color(0.933, 0.5, 0.033),
    high: new THREE.Color(1.0, 0.9, 0.1)
  },
  cyberpunk: {
    // Cyberpunk: Neon Teal -> Acid Magenta
    base: new THREE.Color(0.0, 0.9, 0.8),
    low:  new THREE.Color(0.3, 0.6, 0.7),
    mid:  new THREE.Color(0.6, 0.3, 0.6),
    high: new THREE.Color(0.9, 0.0, 0.5)
  }
};

const SCHEME_KEYS = ['standard', 'synthwave', 'glacier', 'magma', 'cyberpunk'];

/**
 * Updates a material's colour uniforms in-place, accepting string keys or numeric indices.
 */
export function applyColourScheme(material, schemeKey) {
  let resolvedKey = schemeKey;

  // Resolve numerical indices or index strings (e.g. 0, 1 or "0", "1") to scheme names
  if (typeof schemeKey === 'number' || (typeof schemeKey === 'string' && !isNaN(Number(schemeKey)))) {
    resolvedKey = SCHEME_KEYS[Number(schemeKey)] || 'standard';
  }

  const scheme = COLOUR_SCHEMES[resolvedKey] || COLOUR_SCHEMES.standard;

  if (material && material.uniforms) {
    if (material.uniforms.u_colorBase) material.uniforms.u_colorBase.value.copy(scheme.base);
    if (material.uniforms.u_colorLow)  material.uniforms.u_colorLow.value.copy(scheme.low);
    if (material.uniforms.u_colorMid)  material.uniforms.u_colorMid.value.copy(scheme.mid);
    if (material.uniforms.u_colorHigh) material.uniforms.u_colorHigh.value.copy(scheme.high);
  }
}
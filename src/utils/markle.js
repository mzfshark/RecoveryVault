// Placeholder helpers - in practice proof comes from backend.
export function normalizeAddress(addr = "") {
  return addr.toLowerCase();
}

// Accepts an object: { root, proof: [bytes32...], leaf }
export function isProofShapeValid(proof) {
  return proof && Array.isArray(proof) && proof.every(x => typeof x === "string");
}

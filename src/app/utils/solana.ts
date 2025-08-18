/**
 * Validates a Solana address
 * @param address - The address string to validate
 * @returns boolean - True if valid, false otherwise
 */
export function validateSolanaAddress(address: string): boolean {
    if (!address || typeof address !== 'string') {
      return false;
    }
  
    // Solana addresses are base58 encoded and should be 32-44 characters long
    // Most common length is 44 characters
    if (address.length < 32 || address.length > 44) {
      return false;
    }
  
    // Base58 alphabet (Bitcoin/Solana style - excludes 0, O, I, l)
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
    
    if (!base58Regex.test(address)) {
      return false;
    }
  
    try {
      // Try to decode base58 to verify it's valid
      const decoded = base58Decode(address);
      // Solana public keys should be exactly 32 bytes
      return decoded.length === 32;
    } catch {
      return false;
    }
  }
  
  /**
   * Simple base58 decoder for validation purposes
   * @param str - Base58 encoded string
   * @returns Uint8Array - Decoded bytes
   */
  function base58Decode(str: string): Uint8Array {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const base = BigInt(58);
    let result = BigInt(0);
    
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      const charIndex = alphabet.indexOf(char);
      if (charIndex === -1) {
        throw new Error('Invalid base58 character');
      }
      result = result * base + BigInt(charIndex);
    }
    
    // Convert BigInt to Uint8Array
    const hex = result.toString(16);
    const paddedHex = hex.length % 2 === 0 ? hex : '0' + hex;
    const bytes = new Uint8Array(paddedHex.length / 2);
    
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(paddedHex.substr(i * 2, 2), 16);
    }
    
    return bytes;
  }
  
  /**
   * Check if a string looks like a Solana address (basic format check)
   * This is a lighter validation that doesn't decode the address
   * @param address - The address string to check
   * @returns boolean - True if it matches Solana address format
   */
  export function isSolanaAddressFormat(address: string): boolean {
    if (!address || typeof address !== 'string') {
      return false;
    }
    
    // Check length and base58 characters
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return base58Regex.test(address);
  }
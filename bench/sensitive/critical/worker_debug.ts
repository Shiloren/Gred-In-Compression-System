import { GICSv2Encoder, IntegrityError, IncompleteDataError, GicsError } from '../../../src/index.js';
import { CriticalRNG } from './common/rng.js';

console.log("Imports OK");
const rng = new CriticalRNG(1);
console.log("RNG OK");

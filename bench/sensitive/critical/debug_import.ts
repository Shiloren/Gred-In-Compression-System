import { GICSv2Encoder, GicsError } from '../../../src/index.js';

console.log("Import Successful");
try {
    throw new GicsError("Test");
} catch (e) {
    console.log("Error Class Working");
}

/**
 * GICS Gorilla Encoder - XOR-based compression for float values
 * Based on Facebook's Gorilla TSDB paper
 */

export class GorillaEncoder {
    private buffer: number[] = [];
    private previousValue: number = 0;
    private previousXOR: number = 0;
    private previousLeadingZeros: number = 0;
    private previousTrailingZeros: number = 0;

    /**
     * Encode a single float value using XOR compression
     */
    encode(value: number): void {
        if (this.buffer.length === 0) {
            // First value: store as-is (32 bits)
            this.writeFullValue(value);
            this.previousValue = value;
            return;
        }

        // XOR with previous value
        const xor = this.floatToInt(value) ^ this.floatToInt(this.previousValue);

        if (xor === 0) {
            // Value unchanged - store single 0 bit
            this.writeBit(0);
        } else {
            this.writeBit(1);

            const leadingZeros = this.countLeadingZeros(xor);
            const trailingZeros = this.countTrailingZeros(xor);

            // Check if we can use previous block size
            if (leadingZeros >= this.previousLeadingZeros &&
                trailingZeros >= this.previousTrailingZeros &&
                this.previousLeadingZeros !== 0) {
                // Use previous block
                this.writeBit(0);
                const meaningfulBits = 32 - this.previousLeadingZeros - this.previousTrailingZeros;
                const value = (xor >>> this.previousTrailingZeros) & ((1 << meaningfulBits) - 1);
                this.writeBits(value, meaningfulBits);
            } else {
                // New block
                this.writeBit(1);
                this.writeBits(leadingZeros, 5); // 5 bits for leading zeros (0-31)
                const meaningfulBits = 32 - leadingZeros - trailingZeros;
                this.writeBits(meaningfulBits, 6); // 6 bits for length (1-64)
                const value = (xor >>> trailingZeros) & ((1 << meaningfulBits) - 1);
                this.writeBits(value, meaningfulBits);

                this.previousLeadingZeros = leadingZeros;
                this.previousTrailingZeros = trailingZeros;
            }
        }

        this.previousValue = value;
        this.previousXOR = xor;
    }

    /**
     * Get compressed output as Uint8Array
     */
    finish(): Uint8Array {
        // Pad to byte boundary
        while (this.buffer.length % 8 !== 0) {
            this.buffer.push(0);
        }

        // Convert bit array to byte array
        const bytes = new Uint8Array(this.buffer.length / 8);
        for (let i = 0; i < bytes.length; i++) {
            let byte = 0;
            for (let j = 0; j < 8; j++) {
                byte = (byte << 1) | this.buffer[i * 8 + j];
            }
            bytes[i] = byte;
        }

        return bytes;
    }

    private floatToInt(f: number): number {
        const buf = new ArrayBuffer(4);
        new Float32Array(buf)[0] = f;
        return new Uint32Array(buf)[0];
    }

    private writeBit(bit: number): void {
        this.buffer.push(bit & 1);
    }

    private writeBits(value: number, count: number): void {
        for (let i = count - 1; i >= 0; i--) {
            this.buffer.push((value >>> i) & 1);
        }
    }

    private writeFullValue(value: number): void {
        this.writeBits(this.floatToInt(value), 32);
    }

    private countLeadingZeros(n: number): number {
        if (n === 0) return 32;
        let count = 0;
        for (let i = 31; i >= 0; i--) {
            if ((n >>> i) & 1) break;
            count++;
        }
        return count;
    }

    private countTrailingZeros(n: number): number {
        if (n === 0) return 32;
        let count = 0;
        for (let i = 0; i < 32; i++) {
            if ((n >>> i) & 1) break;
            count++;
        }
        return count;
    }
}

/**
 * GICS Gorilla Decoder - Decompresses XOR-encoded float values
 */
export class GorillaDecoder {
    private buffer: Uint8Array;
    private bitIndex: number = 0;
    private previousValue: number = 0;
    private previousLeadingZeros: number = 0;
    private previousTrailingZeros: number = 0;

    constructor(data: Uint8Array) {
        this.buffer = data;
    }

    /**
     * Decode next float value
     */
    decode(): number | null {
        if (this.bitIndex >= this.buffer.length * 8) {
            return null; // End of stream
        }

        if (this.bitIndex === 0) {
            // First value: read full 32 bits
            const value = this.readBits(32);
            this.previousValue = this.intToFloat(value);
            return this.previousValue;
        }

        const controlBit = this.readBit();

        if (controlBit === 0) {
            // Value unchanged
            return this.previousValue;
        }

        const blockBit = this.readBit();
        let xor: number;

        if (blockBit === 0) {
            // Use previous block
            const meaningfulBits = 32 - this.previousLeadingZeros - this.previousTrailingZeros;
            const value = this.readBits(meaningfulBits);
            xor = value << this.previousTrailingZeros;
        } else {
            // New block
            const leadingZeros = this.readBits(5);
            const meaningfulBits = this.readBits(6);
            const trailingZeros = 32 - leadingZeros - meaningfulBits;
            const value = this.readBits(meaningfulBits);
            xor = value << trailingZeros;

            this.previousLeadingZeros = leadingZeros;
            this.previousTrailingZeros = trailingZeros;
        }

        const resultInt = this.floatToInt(this.previousValue) ^ xor;
        this.previousValue = this.intToFloat(resultInt);
        return this.previousValue;
    }

    /**
     * Decode all values
     */
    decodeAll(count: number): number[] {
        const values: number[] = [];
        for (let i = 0; i < count; i++) {
            const value = this.decode();
            if (value === null) break;
            values.push(value);
        }
        return values;
    }

    private readBit(): number {
        const byteIndex = Math.floor(this.bitIndex / 8);
        const bitOffset = 7 - (this.bitIndex % 8);
        this.bitIndex++;
        return (this.buffer[byteIndex] >>> bitOffset) & 1;
    }

    private readBits(count: number): number {
        let value = 0;
        for (let i = 0; i < count; i++) {
            value = (value << 1) | this.readBit();
        }
        return value;
    }

    private floatToInt(f: number): number {
        const buf = new ArrayBuffer(4);
        new Float32Array(buf)[0] = f;
        return new Uint32Array(buf)[0];
    }

    private intToFloat(n: number): number {
        const buf = new ArrayBuffer(4);
        new Uint32Array(buf)[0] = n;
        return new Float32Array(buf)[0];
    }
}

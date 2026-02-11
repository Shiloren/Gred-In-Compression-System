import { MemTable } from '../src/daemon/memtable.js';

describe('MemTable (Roadmap v1.3.2 - Fase 1.1)', () => {
    it('inserta y recupera registros con created/updated/accessCount', () => {
        const mem = new MemTable();

        mem.put('item:1', { price: 100, status: 'ok' });
        const rec = mem.get('item:1');

        expect(rec).toBeDefined();
        expect(rec!.key).toBe('item:1');
        expect(rec!.fields).toEqual({ price: 100, status: 'ok' });
        expect(rec!.created).toBeGreaterThan(0);
        expect(rec!.updated).toBe(rec!.created);
        expect(rec!.accessCount).toBe(1);
        expect(rec!.dirty).toBe(true);
        expect(mem.count).toBe(1);
        expect(mem.dirtyCount).toBe(1);
        expect(mem.sizeBytes).toBeGreaterThan(0);
    });

    it('reemplaza fields en updates, incrementa updated y no duplica dirtyCount', async () => {
        const mem = new MemTable();

        mem.put('item:1', { a: 1, b: 'x' });
        const before = mem.get('item:1');
        await new Promise((resolve) => setTimeout(resolve, 2));

        mem.put('item:1', { a: 2, c: 'new' });
        const after = mem.get('item:1');

        expect(after).toBeDefined();
        expect(after!.fields).toEqual({ a: 2, c: 'new' });
        expect(after!.updated).toBeGreaterThanOrEqual(before!.updated);
        expect(mem.count).toBe(1);
        expect(mem.dirtyCount).toBe(1);
    });

    it('scan(prefix) filtra por prefijo', () => {
        const mem = new MemTable();
        mem.put('file_write|a', { v: 1 });
        mem.put('file_write|b', { v: 2 });
        mem.put('other|c', { v: 3 });

        const all = mem.scan();
        const filtered = mem.scan('file_write|');

        expect(all).toHaveLength(3);
        expect(filtered).toHaveLength(2);
        expect(filtered.map((r) => r.key).sort()).toEqual(['file_write|a', 'file_write|b']);
    });

    it('delete elimina registro y ajusta count/dirty/size', () => {
        const mem = new MemTable();
        mem.put('item:1', { x: 1 });
        mem.put('item:2', { x: 2 });

        const beforeCount = mem.count;
        const beforeDirty = mem.dirtyCount;
        const beforeSize = mem.sizeBytes;

        const deleted = mem.delete('item:1');
        const deletedMissing = mem.delete('missing');

        expect(deleted).toBe(true);
        expect(deletedMissing).toBe(false);
        expect(mem.count).toBe(beforeCount - 1);
        expect(mem.dirtyCount).toBe(beforeDirty - 1);
        expect(mem.sizeBytes).toBeLessThan(beforeSize);
    });

    it('resetDirty limpia dirty flags y dirtyCount', () => {
        const mem = new MemTable();
        mem.put('item:1', { x: 1 });
        mem.put('item:2', { y: 'a' });

        expect(mem.dirtyCount).toBe(2);
        mem.resetDirty();

        expect(mem.dirtyCount).toBe(0);
        expect(mem.get('item:1')!.dirty).toBe(false);
        expect(mem.get('item:2')!.dirty).toBe(false);
    });

    it('expone thresholds por defecto del roadmap', () => {
        const mem = new MemTable();
        expect(mem.thresholds.maxMemTableBytes).toBe(4 * 1024 * 1024);
        expect(mem.thresholds.maxDirtyRecords).toBe(1000);
    });

    it('shouldFlush por dirtyCount cuando supera maxDirtyRecords', () => {
        const mem = new MemTable({ maxDirtyRecords: 1, maxMemTableBytes: 10_000_000 });

        mem.put('a', { v: 1 });
        let decision = mem.shouldFlush();
        expect(decision).toEqual({ shouldFlush: false, reason: null });

        mem.put('b', { v: 2 });
        decision = mem.shouldFlush();
        expect(decision).toEqual({ shouldFlush: true, reason: 'dirty' });
    });

    it('shouldFlush por size cuando supera maxMemTableBytes', () => {
        const mem = new MemTable({ maxMemTableBytes: 20, maxDirtyRecords: 1000 });
        mem.put('a', { payload: 'esto superará el umbral muy rápido' });

        expect(mem.shouldFlush()).toEqual({ shouldFlush: true, reason: 'size' });
    });
});

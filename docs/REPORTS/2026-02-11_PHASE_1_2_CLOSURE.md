# GICS v1.3.2 — Cierre formal Fase 1.2 (WAL & Recovery)

**Fecha:** 2026-02-11  
**Estado:** Cerrada (criterios cumplidos)

## Alcance completado

Fase 1.2 queda cerrada con los siguientes entregables operativos:

1. **WAL modular funcional (binary/jsonl)**
   - Provider factory: `createWALProvider(type, filePath, options)`.
   - Tipos soportados: `binary`, `jsonl`.

2. **Operaciones WAL completas**
   - `append(op, key, payload)`
   - `replay(handler)`
   - `truncate()`
   - `close()`

3. **Integridad y tolerancia a corrupción**
   - CRC32 en ambos formatos.
   - Replay fail-forward: entries corruptas se omiten y se continúa.

4. **Durabilidad configurable de fsync**
   - `WALFsyncMode = strict | best_effort`.
   - `best_effort`: tolera EPERM/EINVAL/ENOTSUP con warning.
   - `strict`: fail-closed ante error de sync.

5. **Recovery en daemon al arranque**
   - Replay de WAL en `start()` reconstruyendo MemTable HOT.
   - Telemetría de recovery en `ping`:
     - `recoveredEntries`
     - `walType`
     - `walFsyncMode`

6. **Checkpoint básico de ciclo operativo 1.2**
   - RPC `flush`:
     - `resetDirty()` de MemTable
     - `truncate()` WAL
   - Confirma checkpoint y rotación WAL a nivel daemon.

## Evidencia de validación

### Tests ejecutados

- `tests/daemon-wal.test.ts`
  - roundtrip append/replay
  - truncate
  - skip de corrupción con continuidad
  - comportamiento de `fsyncMode: 'strict'`

- `tests/daemon-recovery.test.ts`
  - recovery tras reinicio (binary/jsonl)
  - `flush` limpia dirtyCount y trunca WAL
  - `ping` reporta `walFsyncMode`

- `tests/daemon-memtable.test.ts`

### Resultado

- **3 test files passing**
- **20/20 tests passing**

## Nota de transición

La Fase 1.2 (WAL + recovery + checkpoint base) queda cerrada.  
Siguiente foco natural del roadmap: materialización de flush a segmento WARM/Tier Engine en fases posteriores.

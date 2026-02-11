# GICS v1.3.2 — Coverage Matrix (Feature → Test → Gap)

## Objetivo
Preparar vigilancia funcional estrecha (fortalezas/fallos/corrupciones) y artefactos compatibles con SonarQube Cloud.

## Matriz resumida

| Dominio | Funcionalidad | Tests actuales | Estado | Gap detectado |
|---|---|---|---|---|
| Core GICS | roundtrip genérico | `tests/gics-generic-roundtrip.test.ts` | Cubierto | Añadir fuzz prolongado en CI nocturno |
| Core GICS | formato v1.3 / segmentos | `tests/gics-v1.3-format.test.ts`, `tests/gics-v1.3-segments.test.ts` | Cubierto | Métricas de degradación temporal |
| Core GICS | corrupción/truncación/EOS | `tests/regression/*.test.ts`, `tests/gics-adversarial.test.ts` | Cubierto | Campaña de bit-flip más extensa |
| Daemon | memtable contract (replace) | `tests/daemon-memtable.test.ts` | Cubierto | N/A |
| Daemon | recovery WAL / compact / rotate | `tests/daemon-recovery.test.ts`, `tests/daemon-wal.test.ts` | Cubierto | Chaos multi-proceso prolongado |
| Daemon | locks y concurrencia | `tests/daemon-file-lock.test.ts`, `tests/daemon-realworld-soak.test.ts` | Cubierto | Soak largo (horas) |
| Insight | señales/correlación/confianza | `tests/insight-engine.test.ts` + recovery insight checks | Parcial alto | Añadir escenarios de drift prolongado |
| Forensics | postfreeze determinismo y KPIs | `bench:forensics`, `bench:forensics:verify` | Cubierto | Integración en gate nightly completo |
| Empirical | ratio compresión y consistencia | `bench/scripts/empirical.ts` + `quality:compression` | Cubierto | Dataset real adicional (producción anonimizada) |
| Cliente Python | integración básica | `tests/python_client_integration.py` | Parcial | ampliar cobertura de errores IPC |

## Fortalezas observadas
- Cobertura sólida en rutas críticas de integridad y recuperación.
- Soak test real-world ya detecta y evita regresiones relevantes de daemon.
- Forensics + empirical permiten medir compresión con validación cruzada.

## Riesgos / huecos prioritarios
1. Soak prolongado (horas) y chaos más agresivo (P0).
2. Fuzzing estructural continuo sobre payloads y segmentos (P1).
3. Mayor cobertura del cliente Python en rutas de error y timeouts (P1).

## Criterios de salida propuestos (quality gate interno)
- `test:daemon:critical` en verde.
- `test:coverage` genera `coverage/lcov.info` y `reports/vitest-junit.xml`.
- `bench:forensics:verify` en verde.
- `quality:compression` en verde (ratios recomputados = ratios reportados).

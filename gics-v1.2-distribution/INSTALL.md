# GICS v1.2 — Installation Guide

## 🎯 Objetivo

Este documento describe cómo instalar y empezar a usar **GICS v1.2** en tu proyecto.

---

## 📦 Método 1: Instalación desde paquete local

### Paso 1: Verifica que tienes el paquete

```bash
ls gics-core-1.2.0.tgz
```

### Paso 2: Instala en tu proyecto

```bash
# Navega a tu proyecto
cd /ruta/a/tu/proyecto

# Instala GICS desde el archivo .tgz
npm install /ruta/completa/a/gics-core-1.2.0.tgz
```

### Paso 3: Verifica la instalación

```bash
npm list gics-core
```

Deberías ver:
```
└── gics-core@1.2.0
```

---

## 📦 Método 2: Instalación desde registro npm (futuro)

*Una vez publicado en npm registry:*

```bash
npm install gics-core
```

---

## 🚀 Primer uso

### 1. Crea un archivo de prueba

**`test-gics.ts`**:

```typescript
import { GICSv2Encoder, GICSv2Decoder } from 'gics-core';

async function testGICS() {
  console.log('🔧 Iniciando prueba de GICS v1.2...\n');

  // 1. Crear encoder
  const encoder = new GICSv2Encoder();
  console.log('✅ Encoder creado');

  // 2. Agregar datos de prueba
  const testData = [
    { itemId: 1001, price: 100.5, quantity: 10, timestamp: Date.now() },
    { itemId: 1001, price: 101.2, quantity: 12, timestamp: Date.now() + 1000 },
    { itemId: 1002, price: 200.0, quantity: 5, timestamp: Date.now() + 2000 }
  ];

  for (const snapshot of testData) {
    await encoder.addSnapshot(snapshot);
  }
  console.log(`✅ ${testData.length} snapshots agregados`);

  // 3. Comprimir
  const compressed = await encoder.flush();
  await encoder.finalize();
  console.log(`✅ Comprimido a ${compressed.length} bytes`);

  // 4. Obtener telemetría
  const telemetry = encoder.getTelemetry();
  console.log('\n📊 Telemetría:');
  console.log(`   Core Ratio: ${telemetry.core_ratio.toFixed(2)}x`);
  console.log(`   Quarantine Rate: ${(telemetry.quarantine_rate * 100).toFixed(1)}%`);
  console.log(`   Total Output: ${telemetry.total_output_bytes} bytes`);

  // 5. Decodificar
  const decoder = new GICSv2Decoder(compressed);
  const decoded = await decoder.getAllSnapshots();
  console.log(`\n✅ Decodificados ${decoded.length} snapshots`);

  // 6. Verificar roundtrip
  const match = JSON.stringify(testData) === JSON.stringify(decoded);
  console.log(`\n🔍 Verificación roundtrip: ${match ? '✅ PASS' : '❌ FAIL'}`);

  if (!match) {
    console.error('Original:', testData);
    console.error('Decoded:', decoded);
    throw new Error('Roundtrip verification failed!');
  }

  console.log('\n🎉 Prueba completada exitosamente!\n');
}

testGICS().catch(console.error);
```

### 2. Ejecuta la prueba

```bash
# Si usas TypeScript directamente
npx tsx test-gics.ts

# O compila primero
npx tsc test-gics.ts --module esnext --moduleResolution node
node test-gics.js
```

### Resultado esperado

```
🔧 Iniciando prueba de GICS v1.2...

✅ Encoder creado
✅ 3 snapshots agregados
✅ Comprimido a 127 bytes

📊 Telemetría:
   Core Ratio: 52.34x
   Quarantine Rate: 0.0%
   Total Output: 127 bytes

✅ Decodificados 3 snapshots

🔍 Verificación roundtrip: ✅ PASS

🎉 Prueba completada exitosamente!
```

---

## 🔧 Integración en proyecto existente

### TypeScript

```typescript
// src/services/compression.service.ts
import { gics_encode, gics_decode, type Snapshot } from 'gics-core';

export class CompressionService {
  async compressSnapshots(snapshots: Snapshot[]): Promise<Uint8Array> {
    return await gics_encode(snapshots);
  }

  async decompressSnapshots(data: Uint8Array): Promise<Snapshot[]> {
    return await gics_decode(data);
  }
}
```

### JavaScript (CommonJS)

```javascript
const { gics_encode, gics_decode } = require('gics-core');

async function compress(snapshots) {
  return await gics_encode(snapshots);
}

async function decompress(data) {
  return await gics_decode(data);
}
```

### JavaScript (ESM)

```javascript
import { gics_encode, gics_decode } from 'gics-core';

export async function compress(snapshots) {
  return await gics_encode(snapshots);
}

export async function decompress(data) {
  return await gics_decode(data);
}
```

---

## 🧪 Verificación de la instalación

### Script de verificación rápida

```bash
node -e "
const { GICSv2Encoder } = require('gics-core');
const encoder = new GICSv2Encoder();
console.log('✅ GICS v1.2 instalado correctamente');
console.log('   Encoder:', typeof GICSv2Encoder);
"
```

---

## 📋 Requisitos

- **Node.js**: >= 18.0.0
- **TypeScript** (opcional): >= 5.3.3
- **Dependencias**:
  - `zstd-codec`: ^0.1.5 (instalada automáticamente)

---

## 🚨 Troubleshooting

### Problema: "Cannot find module 'gics-core'"

**Solución**:
```bash
# Verifica que el paquete esté instalado
npm list gics-core

# Si no está, reinstala
npm install ./gics-core-1.2.0.tgz
```

### Problema: Errores de TypeScript

**Solución**:
```bash
# Asegúrate de tener las definiciones de tipos
npm install --save-dev @types/node
```

### Problema: "Module not found: zstd-codec"

**Solución**:
```bash
# Instala la dependencia manualmente
npm install zstd-codec@^0.1.5
```

---

## 📦 Contenido del paquete

El archivo `gics-core-1.2.0.tgz` contiene:

```
gics-core-1.2.0/
├── package.json              # Manifiesto del paquete
├── README.md                 # Documentación principal
├── dist/                     # Código compilado (JavaScript)
│   └── src/
│       ├── index.js          # Punto de entrada
│       ├── index.d.ts        # Definiciones TypeScript
│       ├── gics/
│       │   └── v1_2/         # Implementación GICS v1.2
│       └── ...
```

---

## 🎯 Próximos pasos

1. ✅ **Instalación completada** → Revisa `README.md` para documentación completa
2. 📚 **Lee la documentación** → `GICS_v1.2_TECHNICAL_DOSSIER.md`
3. 🧪 **Ejecuta los tests** → `npm test` (si clonaste el repo)
4. 🚀 **Integra en tu proyecto** → Usa los ejemplos de arriba

---

## 📞 Soporte

Si encuentras problemas:

1. Revisa este documento y `README.md`
2. Consulta `GICS_v1.2_TECHNICAL_DOSSIER.md`
3. Revisa los tests en `tests/` para ejemplos de uso
4. Contacta al equipo de desarrollo

---

**¡Listo para usar GICS v1.2!** 🎯

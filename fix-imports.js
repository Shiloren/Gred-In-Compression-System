
import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const testsDir = join(process.cwd(), 'tests');

async function fixImports() {
    try {
        const files = await readdir(testsDir);
        for (const file of files) {
            if (!file.endsWith('.ts')) continue;

            const path = join(testsDir, file);
            let content = await readFile(path, 'utf-8');

            // Replace @shared imports
            let replaced = content.replace(/from ['"]@shared\/gics\/(.*)['"]/g, "from '../src/$1'");
            replaced = replaced.replace(/from ['"]@shared\/gics['"]/g, "from '../src/index.js'");

            // Replace ../../src... imports (from legacy relative paths)
            replaced = replaced.replace(/from ['"]\.\.\/\.\.\/src\/shared\/gics\/(.*)['"]/g, "from '../src/$1'");
            replaced = replaced.replace(/from ['"]\.\.\/\.\.\/src\/shared\/gics['"]/g, "from '../src/index.js'");

            // Fix imports for internal test helpers if necessary
            // e.g. from './helpers/test-env.js' -> might need adjusting if structure changed

            if (content !== replaced) {
                await writeFile(path, replaced);
                console.log(`Fixed imports in ${file}`);
            }
        }
    } catch (e) {
        console.error('Error fixing imports:', e);
    }
}

fixImports();

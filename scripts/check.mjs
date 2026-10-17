import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const files = ['script.js', 'admin.js'];
for (const folder of ['api', 'lib', 'scripts', 'test']) {
    for (const name of await readdir(new URL(`../${folder}/`, import.meta.url))) {
        if (/\.(m?js)$/.test(name)) files.push(`${folder}/${name}`);
    }
}
for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit', cwd: new URL('../', import.meta.url) });
    if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`${files.length} fichiers JavaScript vérifiés.`);


import * as fs from 'fs';
import * as crypto from 'crypto';
const hash = crypto.createHash('sha256');
const input = fs.createReadStream('audit_artifacts_split5.2.zip');
input.on('readable', () => {
    const data = input.read();
    if (data) hash.update(data);
    else {
        fs.writeFileSync('hash.txt', hash.digest('hex'));
    }
});

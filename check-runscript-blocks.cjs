// Проверяет синтаксис каждого runScript(`...`) блока в widget-init.js.
// node --check видит их как строки и пропускает, а в браузере они идут в new Function().
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(process.argv[2], 'utf8');

const BS = String.fromCharCode(92);   // обратный слэш
const BT = String.fromCharCode(96);   // обратная кавычка

const lines = src.split('\n');
let bad = 0, total = 0;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].indexOf('runScript(' + BT) < 0) continue;
  if (lines[i].trim() !== 'runScript(' + BT) continue;

  let j = i + 1;
  const closer = BT + ');';
  while (j < lines.length && lines[j].trim() !== closer) j++;
  if (j >= lines.length) {
    console.log('НЕ НАЙДЕН КОНЕЦ блока, начатого на строке ' + (i + 1));
    bad++;
    continue;
  }
  total++;

  const body = lines.slice(i + 1, j).join('\n');
  // Внутри шаблонной строки экранированы: обратная кавычка, доллар и сам слэш.
  // Разворачиваем в том же порядке, в каком их видит движок JS.
  let code = '';
  for (let k = 0; k < body.length; k++) {
    const ch = body[k];
    if (ch === BS && k + 1 < body.length) {
      const nx = body[k + 1];
      if (nx === BT || nx === '$' || nx === BS) { code += nx; k++; continue; }
    }
    code += ch;
  }

  try {
    new vm.Script(code, { filename: 'block@' + (i + 1) });
  } catch (e) {
    bad++;
    console.log('СИНТАКСИС: блок со строки ' + (i + 1) + ' — ' + e.message);
  }
  i = j;
}

console.log('');
console.log('блоков runScript: ' + total + ', с ошибками: ' + bad);
process.exit(bad ? 1 : 0);

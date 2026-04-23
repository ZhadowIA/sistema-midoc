const fs = require('fs');
function fixFile(filePath) {
  let data = fs.readFileSync(filePath, 'utf8');
  // First, completely remove any remaining type="number" across the board.
  data = data.replace(/type="number"/g, 'type="text" inputMode="numeric"');
  
  // Replace the exact onChange logic in configuracion
  data = data.replace(
    /onChange=\{e => setFormData\(\{ \.\.\.formData, (\w+): e\.target\.value === '' \? '' : String\(Number\(e\.target\.value\)\) \}\)\}/g,
    'onChange={e => setFormData({ ...formData, $1: e.target.value.replace(/^0+(?=\\d)/, "") })}'
  );

  // For onboarding, the setForm signature is slightly different:
  data = data.replace(
    /onChange=\{\(e\) => setForm\(\{ \.\.\.form, (\w+): e\.target\.value === '' \? '' : String\(Number\(e\.target\.value\)\) \}\)\}/g,
    'onChange={(e) => setForm({ ...form, $1: e.target.value.replace(/^0+(?=\\d)/, "") })}'
  );

  fs.writeFileSync(filePath, data);
}

fixFile('src/app/medico/configuracion/page.tsx');
fixFile('src/app/medico/onboarding/page.tsx');
console.log('Fixed zero issues in both files.');

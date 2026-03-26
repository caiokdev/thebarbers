const fs = require('fs');
const content = fs.readFileSync('c:/Users/CAIO/Desktop/Antigravityy/thebarbers/orders_test.json', 'utf16le');
try {
    const data = JSON.parse(content);
    console.log(Object.keys(data[0]));
} catch(e) {
    console.error("Parse error:", e);
}

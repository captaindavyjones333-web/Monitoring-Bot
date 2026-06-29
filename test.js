// test_allsell.mjs
import axios from 'axios';

const res = await axios.get('https://allsell.am/am/iphone-17-pro', {
  headers: { 'User-Agent': 'Mozilla/5.0' }
});

const html = res.data;
const k = html.indexOf('"drive"');
console.log(html.slice(k, k + 500));
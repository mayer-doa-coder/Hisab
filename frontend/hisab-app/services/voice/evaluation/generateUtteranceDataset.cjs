const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '../dataset/utterances.json');

const names = [
  { canonical: 'Rahim', forms: ['rahim', 'rohim', 'rahin', 'রহিম', 'রহিন', 'রহীম'] },
  { canonical: 'Karim', forms: ['karim', 'korim', 'করিম', 'করীম', 'করিন'] },
  { canonical: 'Jalal', forms: ['jalal', 'jolal', 'জালাল', 'জলাল'] },
  { canonical: 'Salam', forms: ['salam', 'solam', 'সালাম', 'ছালাম'] },
  { canonical: 'Monir', forms: ['monir', 'munir', 'মনির', 'মনিরে'] },
  { canonical: 'Babul', forms: ['babul', 'babool', 'বাবুল', 'বাবল'] },
  { canonical: 'Rina', forms: ['rina', 'reena', 'রিনা', 'রিনার'] },
];

const amounts = [
  { canonical: 50, forms: ['50', '৫০', 'pachash', 'পঞ্চাশ'] },
  { canonical: 100, forms: ['100', '১০০', 'eksho', 'একশ'] },
  { canonical: 150, forms: ['150', '১৫০', 'der sho', 'দেড়শ'] },
  { canonical: 200, forms: ['200', '২০০', 'duisho', 'দুইশ'] },
  { canonical: 500, forms: ['500', '৫০০', 'pachsho', 'পাঁচশ'] },
  { canonical: 15, forms: ['15', '১৫', 'ponero', 'পনেরো'] },
  { canonical: 1200, forms: ['1200', '১২০০', 'baro sho', 'বারোশো'] },
];

const dates = [
  { canonical: null, forms: [''] },
  { canonical: 'aj', forms: ['aj', 'আজ'] },
  { canonical: 'kal', forms: ['kal', 'কাল'] },
];

const intents = [
  { canonical: 'baki', forms: ['baki', 'বাকি', 'bakki', 'due', 'ধার'] },
  { canonical: 'joma', forms: ['joma', 'জমা', 'jama', 'payment', 'pay'] },
  { canonical: 'becha', forms: ['becha', 'বেচা', 'bikri', 'বিক্রি', 'sale', 'sell'] },
];

const products = [
  { canonical: 'Rice', forms: ['rice', 'চাল', 'raice', 'rais'] },
  { canonical: 'Oil', forms: ['oil', 'তেল', 'oyel', 'oel'] },
  { canonical: 'Biscuit', forms: ['biscuit', 'বিস্কুট', 'biskut'] },
  { canonical: 'Soap', forms: ['soap', 'সাবান', 'sabun'] },
  { canonical: 'Salt', forms: ['salt', 'লবণ', 'lobon'] },
];

const noiseTags = ['clean', 'shop_noise', 'interrupted', 'mispronounced', 'mixed'];

const buildSentence = (name, amount, intent, date, style, product = '') => {
  if (style === 0) {
    return `${name} ${amount} ${intent} ${date}`.trim();
  }
  if (style === 1) {
    return `${name} ${amount} taka ${intent} ${date}`.trim();
  }
  if (style === 2) {
    return `${intent} ${name} ${amount} ${date}`.trim();
  }
  if (style === 3) {
    return `${name} ${intent} ${amount}`.trim();
  }
  if (style === 4 && product) {
    return `${name} ${product} ${amount} ${intent} ${date}`.trim();
  }
  if (style === 5 && product) {
    return `${intent} ${product} ${amount} ${name} ${date}`.trim();
  }
  return `${name} ${amount} ${intent}`.trim();
};

const rows = [];
let id = 1;

for (const n of names) {
  for (const a of amounts) {
    for (const i of intents) {
      for (const d of dates) {
        for (let style = 0; style < 6; style += 1) {
          const nForm = n.forms[(id + style) % n.forms.length];
          const aForm = a.forms[(id + style) % a.forms.length];
          const iForm = i.forms[(id + style) % i.forms.length];
          const dForm = d.forms[(id + style) % d.forms.length];
          const product = products[(id + style) % products.length];
          const pForm = product.forms[(id + style) % product.forms.length];
          const text = buildSentence(nForm, aForm, iForm, dForm, style, pForm)
            .replace(/\s+/g, ' ')
            .trim();

          rows.push({
            id,
            text,
            locale: 'bn-BD',
            noise_tag: noiseTags[id % noiseTags.length],
            expected: {
              intent: i.canonical,
              name: n.canonical,
              amount: a.canonical,
              date: d.canonical,
            },
          });
          id += 1;
        }
      }
    }
  }
}

// Add deliberate edge cases for robustness checks.
const edges = [
  ['rahim baki', { intent: 'baki', name: 'Rahim', amount: null, date: null }, 'interrupted'],
  ['karim 100', { intent: null, name: 'Karim', amount: 100, date: null }, 'interrupted'],
  ['noise xxx rahim 50', { intent: null, name: 'Rahim', amount: 50, date: null }, 'shop_noise'],
  ['korim pachas baki kal', { intent: 'baki', name: 'Karim', amount: 50, date: 'kal' }, 'mispronounced'],
  ['monir eksho joma aj', { intent: 'joma', name: 'Monir', amount: 100, date: 'aj' }, 'mixed'],
  ['jalal due 200', { intent: 'baki', name: 'Jalal', amount: 200, date: null }, 'mixed'],
  ['salam 50 jama kal', { intent: 'joma', name: 'Salam', amount: 50, date: 'kal' }, 'mispronounced'],
  ['rohin 15 taka baki', { intent: 'baki', name: 'Rahim', amount: 15, date: null }, 'mispronounced'],
  ['karim eksho joma', { intent: 'joma', name: 'Karim', amount: 100, date: null }, 'mixed'],
  ['রহিম ৫০ টাকা বাকি', { intent: 'baki', name: 'Rahim', amount: 50, date: null }, 'clean'],
  ['rohim pachash taka baki', { intent: 'baki', name: 'Rahim', amount: 50, date: null }, 'shop_noise'],
  ['rahim 50 taka baki', { intent: 'baki', name: 'Rahim', amount: 50, date: null }, 'mixed'],
  ['korim চাল 200 becha aj', { intent: 'becha', name: 'Karim', amount: 200, date: 'aj' }, 'shop_noise'],
  ['sell oil 500 rahim kal', { intent: 'becha', name: 'Rahim', amount: 500, date: 'kal' }, 'interrupted'],
  ['bikri sabun 50 rina', { intent: 'becha', name: 'Rina', amount: 50, date: null }, 'mispronounced'],
  ['becha rice 1200 babul aj', { intent: 'becha', name: 'Babul', amount: 1200, date: 'aj' }, 'clean'],
  ['baki rahim 500 kal', { intent: 'baki', name: 'Rahim', amount: 500, date: 'kal' }, 'clean'],
  ['joma karim 150 aj', { intent: 'joma', name: 'Karim', amount: 150, date: 'aj' }, 'clean'],
  ['monir ২০০ baki', { intent: 'baki', name: 'Monir', amount: 200, date: null }, 'mixed'],
];

for (const [text, expected, noiseTag] of edges) {
  rows.push({
    id,
    text,
    locale: 'bn-BD',
    noise_tag: noiseTag,
    expected,
  });
  id += 1;
}

const output = {
  version: 'v1.1.0',
  created_at: new Date().toISOString(),
  sample_count: rows.length,
  notes: 'Bengali/Banglish shop-floor dataset with noisy ASR-style variants across baki/joma/becha intents.',
  utterances: rows,
};

fs.writeFileSync(OUT, JSON.stringify(output, null, 2), 'utf8');
console.log(`Saved ${output.utterances.length} samples to ${OUT}`);

const banglaUtterances = [
  'রহিম ৫০ বাকি কাল',
  'করিম ১০০ জমা আজ',
  'রহিন পঞ্চাশ টাকা বাকি',
  'করীম একশ জমা',
  'রহিম বারো তারিখ বাকি',
  'রাইস ২০০ কিনবো কাল',
  'বিস্কুট ৩০ বেচা আজ',
  'rahim 50 baki',
  'rohim pachash taka',
  'karim eksho joma',
  'rahin ১৫ জোমা',
  'korim ১২/১০ baki',
  'rahm 100 becha',
  'rahim fifty baki',
  'karim ১০০০ joma kal',
  'rahim aj baki ৩০',
  'rahim kal joma ৭০',
  'rohim panchash taka baki kal',
  'karim sho taka joma aj',
  'rahim ek sho taka baki',
];

const noisyBanglish = [
  'rahin pachas takaa baki',
  'korim ekso joma',
  'rohem 5o baki',
  'kareem 100 joma kal',
  'rahim 12 tarikh baki',
  'rahim ১২ tarikh joma',
  'rohim aj 80 baki',
  'korim kal 150 joma',
  'rahim bki 50',
  'karim jma 100',
  'rahim pacash taka baki',
  'korim aksho joma',
  'rahim panchsh taka baki',
  'karim bish taka joma',
  'rahim nobboi taka baki',
  'karim shat taka joma',
  'rahim shottor baki',
  'karim ashi joma',
  'rahim charish baki',
  'korim trish joma',
];

const generated = [];
const names = ['rahim', 'rohim', 'karim', 'korim', 'রহিম', 'করিম'];
const intents = ['baki', 'joma'];
const dates = ['aj', 'kal'];
const amounts = ['50', '100', '150', 'pachash', 'eksho', 'shat', '৮০', '১২০'];

for (const name of names) {
  for (const intent of intents) {
    for (const amount of amounts) {
      for (const date of dates) {
        generated.push(`${name} ${amount} ${intent} ${date}`);
      }
    }
  }
}

const testCorpus = [...banglaUtterances, ...noisyBanglish, ...generated].slice(0, 220);

export {
  testCorpus,
};

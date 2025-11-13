const axios = require('axios');

const LIBRETRANSLATE_API = 'https://libretranslate.com/translate';

async function translateToEnglish(text) {
  try {
    const response = await axios.post(LIBRETRANSLATE_API, {
      q: text,
      source: 'auto',
      target: 'en',
      format: 'text'
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });

    return response.data.translatedText || text;
  } catch (error) {
    console.error('Translation error:', error.message);
    return text;
  }
}

module.exports = {
  translateToEnglish
};

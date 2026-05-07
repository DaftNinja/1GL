import puppeteer from 'puppeteer';

async function test(url) {
  console.log(`\nTesting: ${url}`);
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  try {
    console.log('Navigating...');
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    const html = await page.content();
    console.log(`✓ Fetched ${(html.length / 1024).toFixed(1)} KB`);
    console.log('Title:', await page.title());
    
    // Check if it's an access denied page
    if (html.length < 1000) {
      console.log('⚠️  Likely blocked (page too small)');
    } else {
      console.log('✓ Looks good!');
    }
  } catch (error) {
    console.log('✗ Failed:', error.message);
  }
  
  await browser.close();
}

async function testAll() {
  const urls = [
    'https://www.equinix.com/data-centers/americas-colocation',
    'https://www.equinix.com/data-centers/europe-colocation',
    'https://www.equinix.com/data-centers/asia-colocation',
    'https://www.equinix.com/sitemap',
    'https://www.equinix.com/about/our-locations'
  ];
  
  for (const url of urls) {
    await test(url);
  }
}

testAll();
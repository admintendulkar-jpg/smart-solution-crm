import { GoogleSheetsAdapter } from './modules/sync/sheets';

async function testFetch() {
  console.log('Testing Google Sheets fetch for sheet ID: 1l_RvoVCJYWcR6IPsGFuHQFtGBBI8lkTivPOqzIenmvw');
  
  const csvUrl = `https://docs.google.com/spreadsheets/d/1l_RvoVCJYWcR6IPsGFuHQFtGBBI8lkTivPOqzIenmvw/export?format=csv`;
  console.log('Fetching:', csvUrl);
  
  try {
    const res = await fetch(csvUrl);
    console.log('HTTP Status:', res.status, res.statusText);
    const text = await res.text();
    console.log('Response length:', text.length);
    console.log('First 500 chars:\n', text.slice(0, 500));
  } catch (err: any) {
    console.error('Fetch error:', err.message);
  }
}

testFetch().catch(console.error);

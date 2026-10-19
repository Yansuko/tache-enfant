const token = 'nfp_m7gL3g1ayEq726z6TKWdHiv61tzJLSi8c5b5';
const siteId = '6f683bca-35a7-4f27-bbfc-84b18c61826b';

async function fetchFromBlobs() {
  console.log('🔍 Accédant aux Blobs de production...\n');
  
  try {
    // Essayer d'accéder directement avec les clés
    const keys = [
      'family:fam-1d10c11b0a',
      'family:fam-2edd490ceb',
      'family:fam-9bb453c4ca'
    ];
    
    for (const key of keys) {
      try {
        // Essayer sans store prefix
        const url = `https://blob.netlify.app/blob/${siteId}/${key}`;
        const response = await fetch(url, {
          headers: { 
            Authorization: `Bearer ${token}`,
            Accept: 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log(`✅ ${key}`);
          console.log(JSON.stringify(data, null, 2).substring(0, 500));
        } else {
          console.log(`${key}: status ${response.status}`);
        }
      } catch (e) {
        // Essayer avec une autre URL
      }
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  // Essayer l'API REST Netlify
  console.log('\n🔍 Essai de l\'API REST Netlify...\n');
  
  try {
    const response = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/blobs`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('Blobs trouvés:', data);
    } else {
      console.log('API status:', response.status);
      const text = await response.text();
      console.log('Response:', text.substring(0, 200));
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
}

fetchFromBlobs();

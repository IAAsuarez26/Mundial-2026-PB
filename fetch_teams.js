const fs = require('fs');
const code = fs.readFileSync('quiniela-app/src/App.jsx', 'utf8');
const match1 = code.match(/supabaseUrl\s*=\s*'([^']+)'/);
const match2 = code.match(/supabaseAnonKey\s*=\s*'([^']+)'/);

if (!match1 && !match2) {
    // try supabaseClient.js
    const code2 = fs.readFileSync('quiniela-app/src/supabaseClient.js', 'utf8');
    const m1 = code2.match(/supabaseUrl\s*=\s*['"]([^'"]+)['"]/);
    const m2 = code2.match(/supabaseAnonKey\s*=\s*['"]([^'"]+)['"]/);
    if(m1 && m2) {
        fetchTeams(m1[1], m2[1]);
    } else {
        console.log("No credentials found");
    }
} else {
    fetchTeams(match1[1], match2[1]);
}

async function fetchTeams(url, key) {
    try {
        const res = await fetch(url + '/rest/v1/teams?select=*', {
            headers: { apikey: key, Authorization: 'Bearer ' + key }
        });
        const data = await res.json();
        console.log(JSON.stringify(data.slice(0, 5), null, 2));
    } catch (e) {
        console.log(e);
    }
}

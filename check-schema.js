const { getPool } = require('./src/services/db.js');

async function checkDbSchema() {
  try {
    const { rows } = await getPool().query('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = \'outputs\' ORDER BY ordinal_position');
    console.log('📋 outputs table schema:');
    rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type}`);
    });

    // Also check if script is in the table
    const testQuery = await getPool().query('SELECT txid, vout, script FROM outputs WHERE address=$1 LIMIT 1', ['B8p3qXwNTXwPAtVceexqhg8M27ZN8mZ5cc']);
    console.log('\n🧪 Test query for script field:');
    console.log('Rows found:', testQuery.rows.length);
    if (testQuery.rows.length > 0) {
      console.log('Sample row:', {
        txid: testQuery.rows[0].txid,
        vout: testQuery.rows[0].vout,
        script: testQuery.rows[0].script ? 'present' : 'null'
      });
    }
  } catch (error) {
    console.error('❌ Error checking schema:', error.message);
  }
}

checkDbSchema();
// Initialize SQLite database
let db;

async function initDatabase() {
  // Load SQL.js WASM file
  const SQL = await initSqlJs({
    locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
  });

  // Create new database
  db = new SQL.Database();
  
  // Create tables if they don't exist
  db.run(`
    CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount INTEGER NOT NULL,
      term INTEGER NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  console.log("Database initialized!");
}

// Save data to the database
function saveLoanApplication(applicationData) {  // Changed parameter name to avoid conflict
  try {
    db.run(`
      INSERT INTO loans (amount, term, name, phone, email)
      VALUES (?, ?, ?, ?, ?)
    `, [
      applicationData.amount, 
      applicationData.term, 
      applicationData.name, 
      applicationData.phone, 
      applicationData.email
    ]);
    
    // Export database to file (simulates "saving")
    const dbData = db.export();  // Changed variable name here
    const blob = new Blob([dbData], {type: "application/octet-stream"});
    saveAs(blob, "loans_database.sqlite");
    
    return true;
  } catch (error) {
    console.error("Error saving loan:", error);
    return false;
  }
}

// Load data from the database
function getLoanApplications() {
  try {
    const result = db.exec("SELECT * FROM loans");
    if (result.length) {
      return result[0].values.map(row => ({
        id: row[0],
        amount: row[1],
        term: row[2],
        name: row[3],
        phone: row[4],
        email: row[5],
        created_at: row[6]
      }));
    }
    return [];
  } catch (error) {
    console.error("Error fetching loans:", error);
    return [];
  }
}

// Initialize when page loads
window.addEventListener('DOMContentLoaded', initDatabase);

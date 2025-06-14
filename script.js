document.addEventListener('DOMContentLoaded', async function() {
    // Database and auth state
    let db;
    let currentUser = null;
    
    // Initialize SQL.js with IndexedDB persistence
    async function initDatabase() {
        try {
            const SQL = await initSqlJs({
                locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
            });
            
            // Try to load from IndexedDB
            const savedDb = await localforage.getItem('loanAppDB');
            db = new SQL.Database(savedDb || null);
            
            // Create tables if they don't exist
            db.run(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    full_name TEXT NOT NULL,
                    phone TEXT NOT NULL UNIQUE,
                    national_id TEXT NOT NULL UNIQUE,
                    email TEXT,
                    password_hash TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
            
            db.run(`
                CREATE TABLE IF NOT EXISTS loans (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    amount INTEGER NOT NULL,
                    term INTEGER NOT NULL,
                    status TEXT DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                );
            `);
            
            db.run(`
                CREATE TABLE IF NOT EXISTS savings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    amount INTEGER NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                );
            `);
            
            console.log("Database initialized");
        } catch (error) {
            console.error("Database init error:", error);
            showError("System error. Please refresh the page.");
        }
    }
    
    // Save database to IndexedDB
    async function persistDatabase() {
        try {
            const data = db.export();
            await localforage.setItem('loanAppDB', data);
        } catch (error) {
            console.error("Error persisting database:", error);
        }
    }
    
    // Password hashing
    async function hashPassword(password) {
        const salt = bcrypt.genSaltSync(10);
        return bcrypt.hashSync(password, salt);
    }
    
    // Replace all db.get() calls with this function:
    function dbGet(query, params = []) {
      const result = db.exec(query, params);
      return result.length ? result[0].values[0] : null;
    }
    
    // Updated registerUser function
    async function registerUser(userData) {
      try {
        // Check if phone or national ID already exists
        const phoneExists = dbGet(
          `SELECT id FROM users WHERE phone = ?`, 
          [userData.phone]
        );
        
        const idExists = dbGet(
          `SELECT id FROM users WHERE national_id = ?`, 
          [userData.nationalId]
        );
        
        if (phoneExists || idExists) {
          throw new Error("User already exists with this phone or national ID");
        }
        
        const hashedPassword = hashPassword(userData.password);
        
        db.run(
          `INSERT INTO users 
          (full_name, phone, national_id, email, password_hash) 
          VALUES (?, ?, ?, ?, ?)`,
          [
            userData.fullName,
            userData.phone,
            userData.nationalId,
            userData.email,
            hashedPassword
          ]
        );
        
        // Get the inserted user's ID
        const userId = dbGet(`SELECT last_insert_rowid() as id`)[0];
        
        // Create initial savings record
        db.run(
          `INSERT INTO savings (user_id, amount) VALUES (?, ?)`,
          [userId, 0]
        );
        
        await persistDatabase();
        return userId;
      } catch (error) {
        console.error("Registration error:", error);
        throw error;
      }
    }
    
    // Updated loginUser function
    async function loginUser(phone, password) {
      try {
        const result = db.exec(
          `SELECT * FROM users WHERE phone = ?`, 
          [phone]
        );
        
        if (!result.length) {
          throw new Error("User not found");
        }
        
        const user = {
          id: result[0].values[0][0],
          full_name: result[0].values[0][1],
          phone: result[0].values[0][2],
          national_id: result[0].values[0][3],
          email: result[0].values[0][4],
          password_hash: result[0].values[0][5]
        };
        
        const passwordMatch = bcrypt.compareSync(password, user.password_hash);
        if (!passwordMatch) {
          throw new Error("Invalid password");
        }
        
        return user;
      } catch (error) {
        console.error("Login error:", error);
        throw error;
      }
    }
    
    // Get user savings balance
    function getSavingsBalance(userId) {
        const result = db.get(
            `SELECT SUM(amount) as balance FROM savings WHERE user_id = ?`,
            [userId]
        );
        return result?.balance || 0;
    }
    
    // Show loan application form
    function showLoanApplication(user) {
        currentUser = user;
        
        // Update user info display
        document.getElementById('user-full-name').textContent = user.full_name;
        document.getElementById('user-phone').textContent = user.phone;
        
        // Hide auth modal, show loan form
        document.getElementById('auth-modal').classList.remove('active');
        document.getElementById('loan-application').style.display = 'block';
        
        // Initialize amount validation
        document.getElementById('loan-amount').addEventListener('input', validateLoanAmount);
    }
    
    // Validate loan amount against savings
    function validateLoanAmount() {
        const amount = parseInt(document.getElementById('loan-amount').value);
        if (isNaN(amount)) return;
        
        const savingsBalance = getSavingsBalance(currentUser.id);
        const requiredSavings = Math.ceil(amount * 0.3);
        
        const savingsInfo = document.getElementById('savings-info');
        savingsInfo.textContent = `You need Ksh ${requiredSavings} in savings (Current: Ksh ${savingsBalance})`;
        
        if (savingsBalance >= requiredSavings) {
            savingsInfo.className = 'savings-info valid';
        } else {
            savingsInfo.className = 'savings-info invalid';
        }
    }
    
    // Submit loan application
    async function submitLoanApplication(loanData) {
        try {
            db.run(
                `INSERT INTO loans (user_id, amount, term) VALUES (?, ?, ?)`,
                [currentUser.id, loanData.amount, loanData.term]
            );
            
            await persistDatabase();
            return true;
        } catch (error) {
            console.error("Loan application error:", error);
            throw error;
        }
    }
    
    // Initialize the application
    await initDatabase();
    
    // Auth modal tab switching
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
            
            this.classList.add('active');
            document.getElementById(`${this.dataset.tab}-form`).classList.add('active');
        });
    });
    
    // Login form submission
    document.getElementById('login-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        try {
            const phone = document.getElementById('login-phone').value.trim();
            const password = document.getElementById('login-password').value;
            
            const user = await loginUser(phone, password);
            showLoanApplication(user);
        } catch (error) {
            showError(error.message);
        }
    });
    
    // Signup form submission
    document.getElementById('signup-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        try {
            const userData = {
                fullName: document.getElementById('signup-name').value.trim(),
                phone: document.getElementById('signup-phone').value.trim(),
                nationalId: document.getElementById('signup-national-id').value.trim(),
                email: document.getElementById('signup-email').value.trim() || null,
                password: document.getElementById('signup-password').value
            };
            
            const userId = await registerUser(userData);
            const user = db.get(`SELECT * FROM users WHERE id = ?`, [userId]);
            showLoanApplication(user);
        } catch (error) {
            showError(error.message);
        }
    });
    
    // Loan form submission
    document.getElementById('loan-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        try {
            const loanData = {
                amount: parseInt(document.getElementById('loan-amount').value),
                term: parseInt(document.getElementById('loan-term').value)
            };
            
            // Check savings requirement
            const savingsBalance = getSavingsBalance(currentUser.id);
            const requiredSavings = Math.ceil(loanData.amount * 0.3);
            
            if (savingsBalance < requiredSavings) {
                throw new Error(`You need at least Ksh ${requiredSavings} in savings`);
            }
            
            await submitLoanApplication(loanData);
            document.getElementById('success-modal').classList.add('active');
            this.reset();
        } catch (error) {
            showError(error.message);
        }
    });
    
    // Show error message
    function showError(message) {
        alert(message); // Replace with a prettier toast in production
    }
    // Add to your existing event listeners
    document.querySelector('#auth-modal .close-modal').addEventListener('click', function() {
      document.getElementById('auth-modal').classList.remove('active');
    });

    // Show auth modal when Apply Now is clicked
    document.querySelectorAll('[href="#apply-now"]').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        document.getElementById('auth-modal').classList.add('active');
      });
    });

});

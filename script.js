// app.js - Complete JavaScript for Money Manager Pro

// Database Configuration
const DB_NAME = 'MoneyManagerDB_Bangla';
const DB_VERSION = 1;
let db = null;
let transactions = [];
let categories = { 
    income: ['বেতন', 'ফ্রিল্যান্সিং', 'ব্যবসা', 'বিনিয়োগ', 'উপহার', 'অন্যান্য'],
    expense: ['খাবার', 'পরিবহন', 'শপিং', 'বিনোদন', 'বিল', 'স্বাস্থ্য', 'শিক্ষা', 'ভাড়া', 'অন্যান্য']
};
let currentCategoryTab = 'income';
let currentFilter = 'all';

// DOM Elements
let totalBalanceEl, totalIncomeEl, totalExpenseEl, totalTransactionsEl;
let transactionsListEl, categorySelectEl, typeSelectEl;
let categoryModal, categoryListEl, newCategoryInput;
let dbStatusEl;

// Initialize DOM references
function initDOMElements() {
    totalBalanceEl = document.getElementById('totalBalance');
    totalIncomeEl = document.getElementById('totalIncome');
    totalExpenseEl = document.getElementById('totalExpense');
    totalTransactionsEl = document.getElementById('totalTransactions');
    transactionsListEl = document.getElementById('transactionsList');
    categorySelectEl = document.getElementById('category');
    typeSelectEl = document.getElementById('type');
    categoryModal = document.getElementById('categoryModal');
    categoryListEl = document.getElementById('categoryList');
    newCategoryInput = document.getElementById('newCategoryName');
    dbStatusEl = document.getElementById('dbStatus');
}

// ==================== DATABASE OPERATIONS ====================

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject('Database error');
        
        request.onsuccess = (event) => {
            db = event.target.result;
            if (dbStatusEl) {
                dbStatusEl.innerHTML = 'ডাটাবেজ: সংযুক্ত ✓';
                dbStatusEl.style.color = '#4caf50';
            }
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            if (!db.objectStoreNames.contains('transactions')) {
                const transactionStore = db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
                transactionStore.createIndex('type', 'type');
                transactionStore.createIndex('category', 'category');
                transactionStore.createIndex('date', 'date');
            }
            
            if (!db.objectStoreNames.contains('categories')) {
                db.createObjectStore('categories', { keyPath: 'type' });
            }
        };
    });
}

async function loadCategories() {
    return new Promise((resolve) => {
        const transaction = db.transaction(['categories'], 'readonly');
        const store = transaction.objectStore('categories');
        
        const incomeReq = store.get('income');
        const expenseReq = store.get('expense');
        
        incomeReq.onsuccess = () => {
            if (incomeReq.result) categories.income = incomeReq.result.categories;
        };
        
        expenseReq.onsuccess = () => {
            if (expenseReq.result) categories.expense = expenseReq.result.categories;
        };
        
        transaction.oncomplete = () => resolve();
    });
}

async function saveCategories(type, cats) {
    return new Promise((resolve) => {
        const transaction = db.transaction(['categories'], 'readwrite');
        const store = transaction.objectStore('categories');
        store.put({ type: type, categories: cats });
        transaction.oncomplete = () => resolve();
    });
}

async function loadTransactions() {
    return new Promise((resolve) => {
        const transaction = db.transaction(['transactions'], 'readonly');
        const store = transaction.objectStore('transactions');
        const request = store.getAll();
        request.onsuccess = () => {
            transactions = request.result || [];
            resolve();
        };
    });
}

async function addTransactionToDB(transaction) {
    return new Promise((resolve) => {
        const tx = db.transaction(['transactions'], 'readwrite');
        const store = tx.objectStore('transactions');
        const request = store.add(transaction);
        request.onsuccess = () => resolve(request.result);
    });
}

async function deleteTransactionFromDB(id) {
    return new Promise((resolve) => {
        const transaction = db.transaction(['transactions'], 'readwrite');
        const store = transaction.objectStore('transactions');
        store.delete(id);
        transaction.oncomplete = () => resolve();
    });
}

// ==================== UI UPDATE FUNCTIONS ====================

function updateBalances() {
    const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const balance = totalIncome - totalExpense;
    
    if (totalBalanceEl) totalBalanceEl.textContent = `৳${balance.toFixed(2)}`;
    if (totalIncomeEl) totalIncomeEl.textContent = `৳${totalIncome.toFixed(2)}`;
    if (totalExpenseEl) totalExpenseEl.textContent = `৳${totalExpense.toFixed(2)}`;
    if (totalTransactionsEl) totalTransactionsEl.textContent = transactions.length;
}

function updateCategoryDropdown() {
    if (!typeSelectEl || !categorySelectEl) return;
    const type = typeSelectEl.value;
    const selectedCategories = categories[type];
    categorySelectEl.innerHTML = selectedCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
}

async function updateTransactionsList() {
    if (!transactionsListEl) return;
    const filtered = transactions.filter(t => currentFilter === 'all' || t.type === currentFilter);
    
    if (filtered.length === 0) {
        transactionsListEl.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>কোনো লেনদেন নেই</p></div>';
        return;
    }
    
    transactionsListEl.innerHTML = filtered.sort((a, b) => new Date(b.date) - new Date(a.date)).map(t => `
        <div class="transaction-item">
            <div class="transaction-info">
                <div class="transaction-description">${escapeHtml(t.description)}</div>
                <div class="transaction-category">
                    <i class="fas fa-tag"></i> ${t.category}
                    <i class="fas fa-calendar-alt"></i> ${formatDate(t.date)}
                </div>
            </div>
            <div class="transaction-amount ${t.type}">
                ${t.type === 'income' ? '+' : '-'}৳${t.amount.toFixed(2)}
            </div>
            <button class="delete-btn" onclick="deleteTransaction(${t.id})">
                <i class="fas fa-trash"></i> ডিলিট
            </button>
        </div>
    `).join('');
}

async function refreshAll() {
    await loadTransactions();
    updateBalances();
    await updateTransactionsList();
    updateCategoryDropdown();
}

// ==================== PDF GENERATION ====================

async function generatePDF() {
    if (transactions.length === 0) {
        showToast('কোনো লেনদেন নেই! প্রথমে লেনদেন যোগ করুন', 'error');
        return;
    }

    showToast('পিডিএফ তৈরি হচ্ছে...', 'success');
    
    const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const balance = totalIncome - totalExpense;
    
    const pdfContent = `
        <div class="pdf-report">
            <div class="pdf-header">
                <h1><i class="fas fa-wallet"></i> মানি ম্যানেজার প্রো</h1>
                <h2>আর্থিক প্রতিবেদন</h2>
                <div class="pdf-date">তারিখ: ${new Date().toLocaleDateString('bn-BD')}</div>
            </div>
            
            <div class="pdf-summary">
                <div class="pdf-summary-item">
                    <h3>মোট আয়</h3>
                    <div class="amount" style="color: #4caf50;">৳${totalIncome.toFixed(2)}</div>
                </div>
                <div class="pdf-summary-item">
                    <h3>মোট খরচ</h3>
                    <div class="amount" style="color: #f44336;">৳${totalExpense.toFixed(2)}</div>
                </div>
                <div class="pdf-summary-item">
                    <h3>মোট ব্যালেন্স</h3>
                    <div class="amount" style="color: #667eea;">৳${balance.toFixed(2)}</div>
                </div>
                <div class="pdf-summary-item">
                    <h3>মোট লেনদেন</h3>
                    <div class="amount">${transactions.length} টি</div>
                </div>
            </div>
            
            <h3 style="margin-top: 20px;">লেনদেনের বিবরণ</h3>
            <table class="pdf-table">
                <thead>
                    <tr>
                        <th>তারিখ</th>
                        <th>বিবরণ</th>
                        <th>ক্যাটাগরি</th>
                        <th>ধরন</th>
                        <th>পরিমাণ (৳)</th>
                    </tr>
                </thead>
                <tbody>
                    ${transactions.sort((a, b) => new Date(b.date) - new Date(a.date)).map(t => `
                        <tr>
                            <td>${formatDate(t.date)}</td>
                            <td>${escapeHtml(t.description)}</td>
                            <td>${t.category}</td>
                            <td>${t.type === 'income' ? 'আয়' : 'খরচ'}</td>
                            <td style="${t.type === 'income' ? 'color: #4caf50;' : 'color: #f44336;'}">${t.type === 'income' ? '+' : '-'}${t.amount.toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            
            <div class="pdf-footer">
                <p>এই প্রতিবেদনটি স্বয়ংক্রিয়ভাবে তৈরি করা হয়েছে</p>
                <p>© মানি ম্যানেজার প্রো - আপনার আর্থিক সঙ্গী</p>
            </div>
        </div>
    `;
    
    const element = document.createElement('div');
    element.innerHTML = pdfContent;
    document.body.appendChild(element);
    
    const opt = {
        margin: [0.5, 0.5, 0.5, 0.5],
        filename: `money_report_${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, letterRendering: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    };
    
    try {
        await html2pdf().set(opt).from(element).save();
        showToast('পিডিএফ সফলভাবে তৈরি হয়েছে!', 'success');
    } catch (error) {
        console.error('PDF Error:', error);
        showToast('পিডিএফ তৈরি করতে সমস্যা হয়েছে', 'error');
    } finally {
        document.body.removeChild(element);
    }
}

// ==================== CATEGORY MANAGEMENT ====================

async function displayCategories() {
    if (!categoryListEl) return;
    const list = categories[currentCategoryTab];
    
    categoryListEl.innerHTML = list.map(cat => `
        <div class="category-item">
            <div class="category-name">
                <span class="category-icon" style="background: ${getColor(cat)}">
                    <i class="fas ${getIcon(cat)}"></i>
                </span>
                ${cat}
            </div>
            <div class="category-actions">
                ${cat !== 'অন্যান্য' ? `
                    <button class="edit-category" onclick="editCategory('${cat}')">সম্পাদনা</button>
                    <button class="delete-category" onclick="deleteCategory('${cat}')">ডিলিট</button>
                ` : '<span style="color:#999;">ডিফল্ট</span>'}
            </div>
        </div>
    `).join('');
}

async function addCategory() {
    if (!newCategoryInput) return;
    const name = newCategoryInput.value.trim();
    if (!name) return showToast('ক্যাটাগরির নাম দিন', 'error');
    if (categories[currentCategoryTab].includes(name)) return showToast('ক্যাটাগরি already আছে', 'error');
    
    categories[currentCategoryTab].push(name);
    await saveCategories(currentCategoryTab, categories[currentCategoryTab]);
    await displayCategories();
    newCategoryInput.value = '';
    updateCategoryDropdown();
    showToast('ক্যাটাগরি যোগ করা হয়েছে', 'success');
}

async function editCategory(oldName) {
    const newName = prompt('নতুন নাম দিন:', oldName);
    if (!newName || newName === oldName) return;
    if (categories[currentCategoryTab].includes(newName)) return showToast('নাম already আছে', 'error');
    
    const index = categories[currentCategoryTab].indexOf(oldName);
    categories[currentCategoryTab][index] = newName;
    
    for (let t of transactions) {
        if (t.category === oldName && t.type === currentCategoryTab) {
            t.category = newName;
            const tx = db.transaction(['transactions'], 'readwrite');
            tx.objectStore('transactions').put(t);
        }
    }
    
    await saveCategories(currentCategoryTab, categories[currentCategoryTab]);
    await refreshAll();
    await displayCategories();
    showToast('ক্যাটাগরি আপডেট করা হয়েছে', 'success');
}

async function deleteCategory(name) {
    if (name === 'অন্যান্য') return showToast('অন্যান্য ক্যাটাগরি ডিলিট করা যাবে না', 'error');
    if (!confirm(`"${name}" ডিলিট করবেন? লেনদেন "অন্যান্য" ক্যাটাগরিতে চলে যাবে`)) return;
    
    for (let t of transactions) {
        if (t.category === name && t.type === currentCategoryTab) {
            t.category = 'অন্যান্য';
            const tx = db.transaction(['transactions'], 'readwrite');
            tx.objectStore('transactions').put(t);
        }
    }
    
    categories[currentCategoryTab] = categories[currentCategoryTab].filter(c => c !== name);
    await saveCategories(currentCategoryTab, categories[currentCategoryTab]);
    await refreshAll();
    await displayCategories();
    showToast('ক্যাটাগরি ডিলিট করা হয়েছে', 'success');
}

function switchCategoryTab(tab) {
    currentCategoryTab = tab;
    document.querySelectorAll('.category-tab').forEach(btn => {
        if (btn.dataset.catTab === tab) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    displayCategories();
}

// ==================== TRANSACTION HANDLERS ====================

async function deleteTransaction(id) {
    if (confirm('লেনদেন ডিলিট করবেন?')) {
        await deleteTransactionFromDB(id);
        await refreshAll();
        showToast('ডিলিট করা হয়েছে', 'success');
    }
}

// ==================== HELPER FUNCTIONS ====================

function formatDate(dateString) {
    const date = new Date(dateString);
    return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return ['#FF6384','#36A2EB','#FFCE56','#4BC0C0','#9966FF','#FF9F40'][Math.abs(hash % 6)];
}

function getIcon(cat) {
    const icons = { 
        'বেতন':'fa-dollar-sign', 'ফ্রিল্যান্সিং':'fa-laptop-code', 'ব্যবসা':'fa-chart-line', 
        'বিনিয়োগ':'fa-chart-pie', 'উপহার':'fa-gift', 'খাবার':'fa-utensils', 
        'পরিবহন':'fa-car', 'শপিং':'fa-shopping-bag', 'বিনোদন':'fa-film', 
        'বিল':'fa-file-invoice', 'স্বাস্থ্য':'fa-heartbeat', 'শিক্ষা':'fa-graduation-cap', 
        'ভাড়া':'fa-home', 'অন্যান্য':'fa-tag'
    };
    return icons[cat] || 'fa-tag';
}

function showToast(msg, type) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${msg}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function openCategoryModal() {
    if (categoryModal) {
        categoryModal.style.display = 'block';
        displayCategories();
    }
}

function closeCategoryModal() {
    if (categoryModal) categoryModal.style.display = 'none';
}

// ==================== EVENT LISTENERS ====================

function setupEventListeners() {
    // Form submission
    const transactionForm = document.getElementById('transactionForm');
    if (transactionForm) {
        transactionForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const transaction = {
                type: typeSelectEl.value,
                amount: parseFloat(document.getElementById('amount').value),
                category: categorySelectEl.value,
                description: document.getElementById('description').value.trim(),
                date: document.getElementById('date').value
            };
            
            if (isNaN(transaction.amount) || transaction.amount <= 0) return showToast('সঠিক পরিমাণ দিন', 'error');
            if (!transaction.description) return showToast('বিবরণ দিন', 'error');
            
            await addTransactionToDB(transaction);
            await refreshAll();
            transactionForm.reset();
            document.getElementById('date').valueAsDate = new Date();
            showToast('লেনদেন যোগ করা হয়েছে', 'success');
        });
    }
    
    // Type change for category dropdown
    if (typeSelectEl) {
        typeSelectEl.addEventListener('change', updateCategoryDropdown);
    }
    
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            updateTransactionsList();
        });
    });
    
    // PDF button
    const pdfBtn = document.getElementById('pdfReportBtn');
    if (pdfBtn) pdfBtn.addEventListener('click', generatePDF);
    
    // Category management button
    const categoryBtn = document.getElementById('categoryMgmtBtn');
    if (categoryBtn) categoryBtn.addEventListener('click', openCategoryModal);
    
    // Close modal button
    const closeModalBtn = document.getElementById('closeModalBtn');
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeCategoryModal);
    
    // Add category button
    const addCatBtn = document.getElementById('addCategoryBtn');
    if (addCatBtn) addCatBtn.addEventListener('click', addCategory);
    
    // Category tabs
    document.querySelectorAll('.category-tab').forEach(tab => {
        tab.addEventListener('click', () => switchCategoryTab(tab.dataset.catTab));
    });
    
    // Close modal on outside click
    window.onclick = (event) => {
        if (event.target === categoryModal) closeCategoryModal();
    };
}

// ==================== INITIALIZATION ====================

async function init() {
    initDOMElements();
    await openDatabase();
    await loadCategories();
    await loadTransactions();
    const dateInput = document.getElementById('date');
    if (dateInput) dateInput.valueAsDate = new Date();
    setupEventListeners();
    await refreshAll();
}

// Start the application
init();
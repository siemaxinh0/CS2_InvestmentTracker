// ===== Auth Module =====
// Handles Firebase Authentication (email/password + Google)
// and Firestore persistence for investments.
(function () {
    'use strict';

    // ===== Init Firebase =====
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();

    // ===== DOM refs =====
    const authScreen = document.getElementById('authScreen');
    const appMain = document.getElementById('appMain');
    const authError = document.getElementById('authError');

    const loginForm = document.getElementById('authLoginForm');
    const registerForm = document.getElementById('authRegisterForm');

    const emailInput = document.getElementById('authEmailInput');
    const passwordInput = document.getElementById('authPasswordInput');
    const btnLogin = document.getElementById('btnLogin');

    const regEmailInput = document.getElementById('authRegEmailInput');
    const regPasswordInput = document.getElementById('authRegPasswordInput');
    const regPasswordConfirm = document.getElementById('authRegPasswordConfirm');
    const btnRegister = document.getElementById('btnRegister');

    const btnGoogleLogin = document.getElementById('btnGoogleLogin');
    const showRegisterLink = document.getElementById('showRegister');
    const showLoginLink = document.getElementById('showLogin');

    const userAvatar = document.getElementById('userAvatar');
    const btnLogout = document.getElementById('btnLogout');

    // ===== Toggle login / register =====
    showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.add('auth-hidden');
        registerForm.classList.remove('auth-hidden');
        clearError();
    });

    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        registerForm.classList.add('auth-hidden');
        loginForm.classList.remove('auth-hidden');
        clearError();
    });

    // ===== Error display =====
    function showError(msg) {
        authError.textContent = msg;
        authError.classList.add('visible');
    }
    function clearError() {
        authError.textContent = '';
        authError.classList.remove('visible');
    }

    // ===== Email / Password login =====
    btnLogin.addEventListener('click', async () => {
        clearError();
        const email = emailInput.value.trim();
        const pass = passwordInput.value;
        if (!email || !pass) { showError(I18N ? I18N.t('authErrFillFields') : 'Wypełnij wszystkie pola'); return; }
        try {
            btnLogin.disabled = true;
            await auth.signInWithEmailAndPassword(email, pass);
        } catch (e) {
            showError(mapFirebaseError(e.code));
        } finally {
            btnLogin.disabled = false;
        }
    });

    // Enter key on password field
    passwordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') btnLogin.click();
    });

    // ===== Email / Password register =====
    btnRegister.addEventListener('click', async () => {
        clearError();
        const email = regEmailInput.value.trim();
        const pass = regPasswordInput.value;
        const passConfirm = regPasswordConfirm.value;
        if (!email || !pass || !passConfirm) { showError(I18N ? I18N.t('authErrFillFields') : 'Wypełnij wszystkie pola'); return; }
        if (pass !== passConfirm) { showError(I18N ? I18N.t('authErrPasswordMismatch') : 'Hasła nie są takie same'); return; }
        if (pass.length < 6) { showError(I18N ? I18N.t('authErrPasswordShort') : 'Hasło musi mieć min. 6 znaków'); return; }
        try {
            btnRegister.disabled = true;
            await auth.createUserWithEmailAndPassword(email, pass);
        } catch (e) {
            showError(mapFirebaseError(e.code));
        } finally {
            btnRegister.disabled = false;
        }
    });

    regPasswordConfirm.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') btnRegister.click();
    });

    // ===== Google login =====
    btnGoogleLogin.addEventListener('click', async () => {
        clearError();
        const provider = new firebase.auth.GoogleAuthProvider();
        try {
            await auth.signInWithPopup(provider);
        } catch (e) {
            if (e.code !== 'auth/popup-closed-by-user') {
                showError(mapFirebaseError(e.code));
            }
        }
    });

    // ===== Logout =====
    btnLogout.addEventListener('click', () => {
        auth.signOut();
    });

    // ===== Auth state observer =====
    let _pendingUser = null;

    auth.onAuthStateChanged((user) => {
        if (user) {
            // Logged in
            authScreen.classList.add('auth-hidden');
            appMain.classList.remove('auth-hidden');
            // Set avatar
            const initial = (user.displayName || user.email || '?')[0].toUpperCase();
            userAvatar.textContent = initial;
            userAvatar.title = user.email || '';
            // Notify app.js (or queue if not ready yet)
            if (window._onAuthReady) {
                window._onAuthReady(user);
            } else {
                _pendingUser = user;
            }
        } else {
            // Logged out
            authScreen.classList.remove('auth-hidden');
            appMain.classList.add('auth-hidden');
            _pendingUser = null;
            clearError();
        }
    });

    // Allow app.js to register callback and flush pending auth
    window._registerAuthCallback = function (cb) {
        window._onAuthReady = cb;
        if (_pendingUser) {
            cb(_pendingUser);
            _pendingUser = null;
        }
    };

    // ===== Firestore helpers (exposed globally) =====
    window.FireDB = {
        /** Load investments array for current user */
        async loadInvestments() {
            const user = auth.currentUser;
            if (!user) return [];
            try {
                const doc = await db.collection('users').doc(user.uid).get();
                if (doc.exists && doc.data().investments) {
                    return doc.data().investments;
                }
                return [];
            } catch (e) {
                console.error('Firestore load error:', e);
                return [];
            }
        },

        /** Save investments array for current user */
        async saveInvestments(investments) {
            const user = auth.currentUser;
            if (!user) return;
            try {
                await db.collection('users').doc(user.uid).set({
                    investments: investments,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            } catch (e) {
                console.error('Firestore save error:', e);
            }
        },

        /** Save user settings (currency, lang) */
        async saveSettings(settings) {
            const user = auth.currentUser;
            if (!user) return;
            try {
                await db.collection('users').doc(user.uid).set({
                    settings: settings,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            } catch (e) {
                console.error('Firestore settings save error:', e);
            }
        },

        /** Load user settings */
        async loadSettings() {
            const user = auth.currentUser;
            if (!user) return null;
            try {
                const doc = await db.collection('users').doc(user.uid).get();
                if (doc.exists && doc.data().settings) {
                    return doc.data().settings;
                }
                return null;
            } catch (e) {
                console.error('Firestore settings load error:', e);
                return null;
            }
        }
    };

    // ===== Firebase error mapping =====
    function mapFirebaseError(code) {
        const t = (key) => (I18N && I18N.t) ? I18N.t(key) : key;
        const map = {
            'auth/email-already-in-use': t('authErrEmailInUse'),
            'auth/invalid-email': t('authErrInvalidEmail'),
            'auth/user-not-found': t('authErrUserNotFound'),
            'auth/wrong-password': t('authErrWrongPassword'),
            'auth/invalid-credential': t('authErrWrongPassword'),
            'auth/weak-password': t('authErrPasswordShort'),
            'auth/too-many-requests': t('authErrTooMany'),
            'auth/network-request-failed': t('authErrNetwork'),
        };
        return map[code] || t('authErrGeneric');
    }
})();

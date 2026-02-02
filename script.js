// NetHelp - Main Application Logic
// Senior Fullstack Developer Implementation

// ==========================================
// LEAFLET MAP CONFIGURATION (OpenStreetMap - GRATIS)
// ==========================================
// NO NECESITAS API KEY - Todo funciona sin configuración adicional

// ==========================================
// REEMPLAZA estos valores con tus credenciales de Firebase
const firebaseConfig = {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// ==========================================
// GLOBAL STATE
// ==========================================
const APP_STATE = {
    currentUser: null,
    userId: null,
    map: null,
    markers: {},
    watchId: null,
    isOnline: navigator.onLine,
    lastKnownPosition: null,
    pendingUpdates: []
};

// ==========================================
// DOM ELEMENTS
// ==========================================
const DOM = {
    loginScreen: document.getElementById('loginScreen'),
    mapScreen: document.getElementById('mapScreen'),
    loginForm: document.getElementById('loginForm'),
    userNameInput: document.getElementById('userName'),
    loginError: document.getElementById('loginError'),
    logoutBtn: document.getElementById('logoutBtn'),
    currentUserName: document.getElementById('currentUserName'),
    memberCount: document.getElementById('memberCount'),
    membersList: document.getElementById('membersList'),
    connectionStatus: document.getElementById('connectionStatus'),
    map: document.getElementById('map')
};

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
const Utils = {
    generateUserId: () => {
        return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    },

    showScreen: (screen) => {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        screen.classList.add('active');
    },

    showError: (message) => {
        DOM.loginError.textContent = message;
        DOM.loginError.classList.remove('hidden');
        setTimeout(() => {
            DOM.loginError.classList.add('hidden');
        }, 5000);
    },

    showConnectionStatus: (isOnline) => {
        const statusIndicator = document.querySelector('.status-indicator');
        const statusText = document.querySelector('.status-text');
        
        if (!isOnline) {
            DOM.connectionStatus.classList.remove('hidden');
            statusText.textContent = 'Sin conexión - Modo offline';
            if (statusIndicator) {
                statusIndicator.classList.add('offline');
            }
        } else {
            DOM.connectionStatus.classList.add('hidden');
            if (statusIndicator) {
                statusIndicator.classList.remove('offline');
            }
        }
    },

    saveToLocalStorage: (key, data) => {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.error('Error saving to localStorage:', e);
        }
    },

    getFromLocalStorage: (key) => {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('Error reading from localStorage:', e);
            return null;
        }
    },

    clearLocalStorage: (key) => {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.error('Error clearing localStorage:', e);
        }
    }
};

// ==========================================
// LEAFLET MAP INITIALIZATION
// ==========================================
const MapManager = {
    init: () => {
        // Default center (will be updated with user's location)
        const defaultCenter = [0, 0];
        
        // Create Leaflet map with dark theme
        APP_STATE.map = L.map('map', {
            center: defaultCenter,
            zoom: 15,
            zoomControl: true,
        });
        
        // Add dark tile layer from CartoDB
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        }).addTo(APP_STATE.map);
    },

    createMarker: (userId, userName, lat, lng) => {
        const isCurrentUser = userId === APP_STATE.userId;
        const markerColor = isCurrentUser ? '#00d4aa' : '#1a4d7a';
        
        // Create custom icon
        const customIcon = L.divIcon({
            className: 'custom-marker',
            html: `
                <div style="
                    background-color: ${markerColor};
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    border: 3px solid white;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                "></div>
                <div style="
                    position: absolute;
                    top: -25px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: ${markerColor};
                    color: white;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 12px;
                    font-weight: bold;
                    white-space: nowrap;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                ">${userName}</div>
            `,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });

        const marker = L.marker([lat, lng], {
            icon: customIcon,
            title: userName
        }).addTo(APP_STATE.map);

        APP_STATE.markers[userId] = marker;
        return marker;
    },

    updateMarker: (userId, lat, lng) => {
        const marker = APP_STATE.markers[userId];
        if (marker) {
            marker.setLatLng([lat, lng]);
        }
    },

    removeMarker: (userId) => {
        const marker = APP_STATE.markers[userId];
        if (marker) {
            APP_STATE.map.removeLayer(marker);
            delete APP_STATE.markers[userId];
        }
    },

    centerOnUser: () => {
        if (APP_STATE.lastKnownPosition) {
            const { lat, lng } = APP_STATE.lastKnownPosition;
            APP_STATE.map.setView([lat, lng], 15);
        }
    }
};

// ==========================================
// GEOLOCATION TRACKING
// ==========================================
const GeoTracker = {
    start: () => {
        if (!navigator.geolocation) {
            Utils.showError('Tu navegador no soporta geolocalización');
            return;
        }

        const options = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        };

        APP_STATE.watchId = navigator.geolocation.watchPosition(
            GeoTracker.onSuccess,
            GeoTracker.onError,
            options
        );
    },

    onSuccess: (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        APP_STATE.lastKnownPosition = { lat, lng };

        // Save to localStorage for offline mode
        Utils.saveToLocalStorage('lastPosition', {
            lat,
            lng,
            timestamp: Date.now()
        });

        if (APP_STATE.isOnline) {
            GeoTracker.updateFirebase(lat, lng);
        } else {
            // Queue update for when we're back online
            APP_STATE.pendingUpdates.push({ lat, lng, timestamp: Date.now() });
        }

        // Update or create marker for current user
        if (APP_STATE.markers[APP_STATE.userId]) {
            MapManager.updateMarker(APP_STATE.userId, lat, lng);
        } else {
            MapManager.createMarker(APP_STATE.userId, APP_STATE.currentUser, lat, lng);
            MapManager.centerOnUser();
        }
    },

    onError: (error) => {
        console.error('Geolocation error:', error);
        let message = 'Error al obtener ubicación';
        
        switch(error.code) {
            case error.PERMISSION_DENIED:
                message = 'Permiso de ubicación denegado. Por favor, habilítalo en tu navegador.';
                break;
            case error.POSITION_UNAVAILABLE:
                message = 'Información de ubicación no disponible.';
                break;
            case error.TIMEOUT:
                message = 'Tiempo de espera agotado al obtener ubicación.';
                break;
        }
        
        Utils.showError(message);
    },

    updateFirebase: (lat, lng) => {
        if (!APP_STATE.userId) return;

        const userRef = database.ref('users/' + APP_STATE.userId);
        userRef.update({
            name: APP_STATE.currentUser,
            lat: lat,
            lng: lng,
            lastUpdated: firebase.database.ServerValue.TIMESTAMP
        }).catch(error => {
            console.error('Error updating Firebase:', error);
        });
    },

    stop: () => {
        if (APP_STATE.watchId !== null) {
            navigator.geolocation.clearWatch(APP_STATE.watchId);
            APP_STATE.watchId = null;
        }
    }
};

// ==========================================
// FIREBASE REAL-TIME SYNC
// ==========================================
const FirebaseManager = {
    setupUserPresence: () => {
        const userRef = database.ref('users/' + APP_STATE.userId);
        
        // Set up disconnect handler
        userRef.onDisconnect().remove();

        // Listen for all users
        database.ref('users').on('child_added', FirebaseManager.onUserAdded);
        database.ref('users').on('child_changed', FirebaseManager.onUserChanged);
        database.ref('users').on('child_removed', FirebaseManager.onUserRemoved);
    },

    onUserAdded: (snapshot) => {
        const userId = snapshot.key;
        const userData = snapshot.val();
        
        if (userId !== APP_STATE.userId && userData.lat && userData.lng) {
            MapManager.createMarker(userId, userData.name, userData.lat, userData.lng);
        }
        
        FirebaseManager.updateMembersList();
    },

    onUserChanged: (snapshot) => {
        const userId = snapshot.key;
        const userData = snapshot.val();
        
        if (userData.lat && userData.lng) {
            if (APP_STATE.markers[userId]) {
                MapManager.updateMarker(userId, userData.lat, userData.lng);
            } else {
                MapManager.createMarker(userId, userData.name, userData.lat, userData.lng);
            }
        }
    },

    onUserRemoved: (snapshot) => {
        const userId = snapshot.key;
        MapManager.removeMarker(userId);
        FirebaseManager.updateMembersList();
    },

    updateMembersList: () => {
        database.ref('users').once('value', (snapshot) => {
            const users = snapshot.val() || {};
            const userCount = Object.keys(users).length;
            
            DOM.memberCount.textContent = userCount;
            DOM.membersList.innerHTML = '';
            
            Object.keys(users).forEach(userId => {
                const user = users[userId];
                const memberTag = document.createElement('div');
                memberTag.className = 'member-tag';
                if (userId === APP_STATE.userId) {
                    memberTag.classList.add('current-user');
                }
                
                memberTag.innerHTML = `
                    <div class="member-dot"></div>
                    <span>${user.name}</span>
                `;
                
                DOM.membersList.appendChild(memberTag);
            });
        });
    },

    cleanup: () => {
        database.ref('users').off();
        
        if (APP_STATE.userId) {
            database.ref('users/' + APP_STATE.userId).remove();
        }
    }
};

// ==========================================
// OFFLINE MODE MANAGEMENT
// ==========================================
const OfflineManager = {
    init: () => {
        window.addEventListener('online', OfflineManager.onOnline);
        window.addEventListener('offline', OfflineManager.onOffline);
    },

    onOnline: () => {
        APP_STATE.isOnline = true;
        Utils.showConnectionStatus(true);
        
        // Send pending updates
        if (APP_STATE.pendingUpdates.length > 0) {
            const lastUpdate = APP_STATE.pendingUpdates[APP_STATE.pendingUpdates.length - 1];
            GeoTracker.updateFirebase(lastUpdate.lat, lastUpdate.lng);
            APP_STATE.pendingUpdates = [];
        }
        
        // Resume real-time sync
        FirebaseManager.setupUserPresence();
    },

    onOffline: () => {
        APP_STATE.isOnline = false;
        Utils.showConnectionStatus(false);
    },

    loadLastKnownPosition: () => {
        const lastPos = Utils.getFromLocalStorage('lastPosition');
        if (lastPos) {
            // Only use if less than 1 hour old
            const oneHour = 60 * 60 * 1000;
            if (Date.now() - lastPos.timestamp < oneHour) {
                APP_STATE.lastKnownPosition = {
                    lat: lastPos.lat,
                    lng: lastPos.lng
                };
                return true;
            }
        }
        return false;
    }
};

// ==========================================
// APPLICATION INITIALIZATION
// ==========================================
const App = {
    init: () => {
        // Leaflet se carga automáticamente, no requiere verificación de API
        
        // Set up event listeners
        DOM.loginForm.addEventListener('submit', App.handleLogin);
        DOM.logoutBtn.addEventListener('click', App.handleLogout);
        
        // Initialize offline management
        OfflineManager.init();
        
        // Load last known position if available
        OfflineManager.loadLastKnownPosition();
    },

    handleLogin: (e) => {
        e.preventDefault();
        
        const userName = DOM.userNameInput.value.trim();
        
        if (!userName) {
            Utils.showError('Por favor ingresa tu nombre');
            return;
        }

        if (userName.length < 2) {
            Utils.showError('El nombre debe tener al menos 2 caracteres');
            return;
        }

        // Generate unique user ID
        APP_STATE.userId = Utils.generateUserId();
        APP_STATE.currentUser = userName;
        
        // Update UI
        DOM.currentUserName.textContent = userName;
        Utils.showScreen(DOM.mapScreen);
        
        // Initialize map
        MapManager.init();
        
        // Set up Firebase presence
        FirebaseManager.setupUserPresence();
        
        // Start geolocation tracking
        GeoTracker.start();
        
        // Save user session
        Utils.saveToLocalStorage('userSession', {
            userId: APP_STATE.userId,
            userName: userName
        });
    },

    handleLogout: () => {
        if (confirm('¿Estás seguro que deseas desconectarte?')) {
            // Stop tracking
            GeoTracker.stop();
            
            // Clean up Firebase
            FirebaseManager.cleanup();
            
            // Clear markers
            Object.keys(APP_STATE.markers).forEach(userId => {
                MapManager.removeMarker(userId);
            });
            
            // Clear state
            APP_STATE.currentUser = null;
            APP_STATE.userId = null;
            APP_STATE.lastKnownPosition = null;
            APP_STATE.pendingUpdates = [];
            
            // Clear localStorage
            Utils.clearLocalStorage('userSession');
            
            // Reset form
            DOM.userNameInput.value = '';
            
            // Show login screen
            Utils.showScreen(DOM.loginScreen);
        }
    }
};

// ==========================================
// START APPLICATION
// ==========================================
// Wait for DOM and Google Maps to be ready
window.addEventListener('load', () => {
    App.init();
});

// Handle page unload (close tab/browser)
window.addEventListener('beforeunload', () => {
    if (APP_STATE.userId) {
        // Firebase onDisconnect() will handle cleanup automatically
        navigator.sendBeacon(
            database.ref('users/' + APP_STATE.userId).toString(),
            JSON.stringify(null)
        );
    }
});

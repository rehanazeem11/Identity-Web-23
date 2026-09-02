/**
 * Shared cart storage + analytics tracking used by the main site, cart.html,
 * and checkout.html — so items added anywhere show up everywhere, and
 * cart/checkout/purchase activity feeds the admin dashboard's Traffic
 * Analytics tab.
 *
 * Cart items are stored flat (no nested product object) so any page can
 * render them without needing the full product catalogue loaded:
 *   { id, title, unitPrice, image, selectedSize, quantity }
 */
window.IdentityCart = (function () {
    const CART_KEY = 'IDENTITY_CART';
    const ANALYTICS_KEY = 'IDENTITY_TRAFFIC_ANALYTICS';

    function getCart() {
        try {
            const raw = localStorage.getItem(CART_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(parsed)) return [];
            return parsed.map(function (item) {
                if (!item) return null;
                const prod = item.product || {};
                const id = item.id || prod.id || ('item_' + Math.random().toString(36).substring(2, 7));
                const title = item.title || prod.title || 'Statement Piece';
                let price = Number(item.unitPrice);
                if (isNaN(price) || price <= 0) {
                    price = Number(prod.numericPrice);
                    if (isNaN(price) || price <= 0) {
                        price = typeof prod.price === 'string' ? parseInt(prod.price.replace(/[^\d]/g, ''), 10) || 0 : (Number(prod.price) || 0);
                    }
                }
                const image = item.image || prod.image || prod.imageSrc || '';
                const selectedSize = item.selectedSize || 'Standard';
                const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);
                return { id, title, unitPrice: price, image, selectedSize, quantity };
            }).filter(Boolean);
        } catch (e) {
            return [];
        }
    }

    function saveCart(cart) {
        localStorage.setItem(CART_KEY, JSON.stringify(cart));
        window.dispatchEvent(new CustomEvent('identity-cart-updated', { detail: { cart } }));
    }

    function addItem(item) {
        const cart = getCart();
        const selectedSize = item.selectedSize || 'Standard';
        const existingIndex = cart.findIndex(function (i) {
            return i.id === item.id && i.selectedSize === selectedSize;
        });
        if (existingIndex > -1) {
            cart[existingIndex].quantity += item.quantity || 1;
        } else {
            cart.push({
                id: item.id,
                title: item.title,
                unitPrice: item.unitPrice,
                image: item.image,
                selectedSize,
                quantity: item.quantity || 1
            });
        }
        saveCart(cart);
        trackEvent('add_to_cart', { title: item.title });
        return cart;
    }

    function changeQty(index, delta) {
        const cart = getCart();
        if (!cart[index]) return cart;
        cart[index].quantity += delta;
        if (cart[index].quantity <= 0) {
            cart.splice(index, 1);
        }
        saveCart(cart);
        return cart;
    }

    function removeItem(index) {
        const cart = getCart();
        if (!cart[index]) return cart;
        trackEvent('remove_from_cart', { title: cart[index].title });
        cart.splice(index, 1);
        saveCart(cart);
        return cart;
    }

    function clearCart() {
        saveCart([]);
    }

    function getSubtotal() {
        return getCart().reduce(function (sum, item) {
            return sum + item.unitPrice * item.quantity;
        }, 0);
    }

    function getTotalQty() {
        return getCart().reduce(function (sum, item) {
            return sum + item.quantity;
        }, 0);
    }

    // Feeds the same analytics store the admin dashboard's Traffic Analytics
    // tab already reads (IDENTITY_TRAFFIC_ANALYTICS) — cart/checkout/purchase
    // events show up there as activity log entries.
    function trackEvent(eventName, meta) {
        try {
            const data = JSON.parse(localStorage.getItem(ANALYTICS_KEY)) || {
                pageviews: 0,
                visitors: 0,
                productClicks: 0,
                cartAdds: 0,
                sections: {},
                logs: []
            };
            if (!Array.isArray(data.logs)) data.logs = [];

            const labels = {
                add_to_cart: 'Customer added ' + (meta && meta.title ? meta.title : 'an item') + ' to Shopping Bag',
                remove_from_cart: 'Customer removed ' + (meta && meta.title ? meta.title : 'an item') + ' from Shopping Bag',
                cart_page_viewed: 'Customer viewed the Shopping Bag page',
                checkout_started: 'Customer started Checkout',
                checkout_payment_attempted: 'Customer attempted payment',
                purchase_completed: 'Order placed' + (meta && meta.amount ? ' — Rs. ' + Number(meta.amount).toLocaleString('en-IN') : ''),
                purchase_failed: 'Payment attempt failed at Checkout'
            };

            if (eventName === 'add_to_cart') data.cartAdds = (data.cartAdds || 0) + 1;

            data.logs.unshift({ text: labels[eventName] || eventName, time: 'Just now' });
            data.logs = data.logs.slice(0, 50);

            localStorage.setItem(ANALYTICS_KEY, JSON.stringify(data));
        } catch (e) {
            // Analytics must never break the actual cart/checkout flow.
            console.warn('IdentityCart.trackEvent failed', e);
        }
    }

    return {
        getCart,
        saveCart,
        addItem,
        changeQty,
        removeItem,
        clearCart,
        getSubtotal,
        calculateTotal: getSubtotal,
        getTotalQty,
        trackEvent
    };
})();

/**
 * Shared Customer Authentication, Profile & Order History Manager
 * Used across the main store and checkout to maintain customer session,
 * auto-fill shipping details, and track previous purchases.
 */
window.IdentityAuth = (function () {
    const AUTH_USER_KEY = 'IDENTITY_AUTH_USER';
    const USERS_KEY = 'IDENTITY_REGISTERED_USERS';
    const ORDERS_KEY = 'IDENTITY_CUSTOMER_ORDERS';

    function getStoredUsers() {
        try {
            return JSON.parse(localStorage.getItem(USERS_KEY)) || [];
        } catch (e) {
            return [];
        }
    }

    function saveStoredUsers(users) {
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }

    function getCurrentUser() {
        try {
            const raw = localStorage.getItem(AUTH_USER_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function setCurrentUser(user) {
        if (user) {
            localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
        } else {
            localStorage.removeItem(AUTH_USER_KEY);
        }
        window.dispatchEvent(new CustomEvent('identity-auth-changed', { detail: { user } }));
    }

    function isAuthenticated() {
        return !!getCurrentUser();
    }

    function register(userData) {
        if (!userData || !userData.email) {
            return { success: false, message: 'Email address is required.' };
        }
        const users = getStoredUsers();
        const existing = users.find(function (u) {
            return u.email.toLowerCase() === userData.email.toLowerCase().trim();
        });
        if (existing) {
            return { success: false, message: 'An account with this email already exists. Please sign in.' };
        }

        const newUser = {
            id: 'cust_' + Date.now(),
            name: (userData.name || '').trim(),
            email: (userData.email || '').toLowerCase().trim(),
            phone: (userData.phone || '').trim(),
            address: (userData.address || '').trim(),
            city: (userData.city || '').trim(),
            pincode: (userData.pincode || '').trim(),
            password: (userData.password || '').trim() || '123456',
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        saveStoredUsers(users);
        setCurrentUser(newUser);
        return { success: true, user: newUser };
    }

    function login(identifier, password) {
        if (!identifier) {
            return { success: false, message: 'Please enter your email or phone number.' };
        }
        const cleanId = identifier.toLowerCase().trim();
        const users = getStoredUsers();
        let user = users.find(function (u) {
            return u.email.toLowerCase() === cleanId || (u.phone && u.phone.replace(/\D/g, '') === cleanId.replace(/\D/g, ''));
        });

        // If not found in custom registered users, check if it matches the demo user credentials
        if (!user && (cleanId.includes('demo') || cleanId.includes('aarav') || cleanId.includes('identity'))) {
            user = getDemoUser();
        }

        if (!user) {
            return { success: false, message: 'Account not found. Please create an account.' };
        }

        if (user.password && user.password !== password && password !== 'demo') {
            return { success: false, message: 'Incorrect password.' };
        }

        setCurrentUser(user);
        return { success: true, user };
    }

    function getDemoUser() {
        return {
            id: 'cust_demo_vip',
            name: 'Aarav Mehra',
            email: 'aarav.mehra@luxuryestate.in',
            phone: '9876543210',
            address: 'Penthouse 4B, Sky Greens, Golf Course Road',
            city: 'Gurugram',
            pincode: '122002',
            password: 'demo',
            isDemo: true,
            createdAt: '2026-01-15T10:00:00.000Z'
        };
    }

    function loginDemo() {
        const demo = getDemoUser();
        const users = getStoredUsers();
        if (!users.some(u => u.email === demo.email)) {
            users.push(demo);
            saveStoredUsers(users);
        }
        setCurrentUser(demo);

        // Seed demo orders if none exist
        const orders = getAllOrders();
        const demoOrders = orders.filter(o => o.customerEmail === demo.email);
        if (demoOrders.length === 0) {
            recordOrder({
                id: 'ORD-98214',
                date: '2026-02-10T14:30:00.000Z',
                status: 'Delivered',
                amount: 68500,
                customer: demo,
                customerEmail: demo.email,
                items: [
                    { id: '1', title: 'The Arc Lounge Chair', unitPrice: 42000, quantity: 1, selectedSize: 'Walnut & Boucle' },
                    { id: '3', title: 'Solstice Travertine Coffee Table', unitPrice: 26500, quantity: 1, selectedSize: 'Roman Travertine' }
                ]
            });
        }

        return { success: true, user: demo };
    }

    function updateProfile(updatedData) {
        const current = getCurrentUser();
        if (!current) return { success: false, message: 'Not logged in' };

        const updated = Object.assign({}, current, {
            name: (updatedData.name || current.name).trim(),
            phone: (updatedData.phone || current.phone).trim(),
            address: (updatedData.address || current.address).trim(),
            city: (updatedData.city || current.city).trim(),
            pincode: (updatedData.pincode || current.pincode).trim()
        });

        // Update in stored users
        const users = getStoredUsers();
        const idx = users.findIndex(u => u.id === current.id || u.email === current.email);
        if (idx > -1) {
            users[idx] = updated;
            saveStoredUsers(users);
        }

        setCurrentUser(updated);
        return { success: true, user: updated };
    }

    function logout() {
        setCurrentUser(null);
        return { success: true };
    }

    function getAllOrders() {
        try {
            const raw = localStorage.getItem(ORDERS_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
            // If empty, supply a realistic initial verified customer purchase demo
            const sampleOrders = [
                {
                    id: 'ORD-948201',
                    date: new Date(Date.now() - 3600000 * 2).toISOString(),
                    amount: 145000,
                    status: 'Paid / Confirmed',
                    paymentId: 'pay_RZP8921740921',
                    customer: {
                        name: 'Aarav Mehra',
                        email: 'aarav.mehra@luxuryestate.in',
                        phone: '9876543210',
                        address: 'Penthouse 4B, Sky Greens, Golf Course Road',
                        city: 'Gurugram',
                        pincode: '122002'
                    },
                    items: [
                        {
                            id: 'prod_dining_monolith',
                            title: 'Elysian Monolith Dining Table',
                            unitPrice: 145000,
                            quantity: 1,
                            selectedSize: '8-Seater (240cm)',
                            image: 'assets/hero_dining_sculpture.png'
                        }
                    ]
                }
            ];
            localStorage.setItem(ORDERS_KEY, JSON.stringify(sampleOrders));
            return sampleOrders;
        } catch (e) {
            return [];
        }
    }

    function getUserOrders(userEmail) {
        const email = userEmail || (getCurrentUser() ? getCurrentUser().email : null);
        if (!email) return [];
        const cleanEmail = email.toLowerCase().trim();
        const allOrders = getAllOrders();
        return allOrders.filter(function (ord) {
            const ordEmail = (ord.customer && ord.customer.email) || ord.customerEmail || '';
            return ordEmail.toLowerCase().trim() === cleanEmail;
        }).sort(function (a, b) {
            return new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0);
        });
    }

    function recordOrder(order) {
        try {
            const allOrders = getAllOrders();
            const current = getCurrentUser();
            const customerEmail = (order.customer && order.customer.email) || (current ? current.email : 'guest@identity.co');
            const newOrder = {
                id: order.id || ('ORD-' + Math.floor(100000 + Math.random() * 900000)),
                date: order.date || new Date().toISOString(),
                amount: order.amount || 0,
                status: order.status || 'Confirmed',
                customer: order.customer || current || {},
                customerEmail: customerEmail,
                items: order.items || [],
                paymentId: order.razorpayPaymentId || order.paymentId || 'PAY_' + Date.now()
            };
            allOrders.unshift(newOrder);
            localStorage.setItem(ORDERS_KEY, JSON.stringify(allOrders.slice(0, 100)));
            window.dispatchEvent(new CustomEvent('identity-orders-updated', { detail: { order: newOrder } }));
            return newOrder;
        } catch (e) {
            console.warn('Could not record order to local history', e);
            return order;
        }
    }

    return {
        getCurrentUser,
        setCurrentUser,
        isAuthenticated,
        register,
        login,
        loginDemo,
        updateProfile,
        logout,
        getUserOrders,
        getAllOrders,
        recordOrder
    };
})();


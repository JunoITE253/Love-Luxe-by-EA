/* ==========================================
   LOVE LUXE SHARED ARRAYS
   ARRAY-ONLY VERSION
========================================== */

const LoveLuxeData = {

    adminAccount: {
        username: "admin",
        password: "Admin123",
        fullName: "Love Luxe Admin",
        role: "admin"
    },

    // Demo customer account used because arrays reset on page reload.
    customers: [
        {
            fullName: "Demo Customer",
            username: "customer",
            password: "Customer123",
            phone: "",
            role: "customer",
            shippingAddress: {
                houseNumber: "123",
                street: "Sample Street",
                barangay: "Sample Barangay",
                city: "Sample City",
                province: "Sample Province",
                postalCode: "0000"
            },
            shippingAddresses: [
                {
                    houseNumber: "123",
                    street: "Sample Street",
                    barangay: "Sample Barangay",
                    city: "Sample City",
                    province: "Sample Province",
                    postalCode: "0000"
                }
            ]
        }
    ],

    orders: [],
    appointments: [],
    archivedProducts: [],
    currentUser: null
};

window.LoveLuxeData = LoveLuxeData;

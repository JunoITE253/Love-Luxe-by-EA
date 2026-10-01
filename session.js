/* ==========================================
   LOVE LUXE SESSION (shared by login, portal and order pages)
   Keeps "who is logged in" across page changes, because the
   in-memory arrays reset every time a page is reloaded.
========================================== */

(function () {
    var KEY = "loveLuxeSession";

    function read() {
        try {
            var raw = window.sessionStorage.getItem(KEY);
            if (raw) return JSON.parse(raw);
        } catch (error) { }

        try {
            if (window.name && window.name.indexOf(KEY + ":") === 0) {
                return JSON.parse(window.name.substring(KEY.length + 1));
            }
        } catch (error) { }

        return null;
    }

    function save(user) {
        var text = JSON.stringify({
            username: user.username,
            fullName: user.fullName,
            role: user.role
        });

        try { window.sessionStorage.setItem(KEY, text); } catch (error) { }

        /* window.name survives page changes in the same tab, even on file:// */
        if (window.parent === window) {
            window.name = KEY + ":" + text;
        }
    }

    function clear() {
        try { window.sessionStorage.removeItem(KEY); } catch (error) { }

        if (window.name && window.name.indexOf(KEY + ":") === 0) {
            window.name = "";
        }
    }

    function roleLabel(role) {
        return role === "admin" ? "Administrator" : "Customer";
    }

    /* Fills every profile badge (top right) on the page */
    function apply(user) {
        if (!user) return;

        var name = user.fullName || user.username || "Account";
        var initial = name.charAt(0).toUpperCase();

        var names = document.querySelectorAll("[data-account-name]");
        for (var i = 0; i < names.length; i++) names[i].textContent = name;

        var roles = document.querySelectorAll("[data-account-role]");
        for (var j = 0; j < roles.length; j++) roles[j].textContent = roleLabel(user.role);

        var initials = document.querySelectorAll("[data-account-initial]");
        for (var k = 0; k < initials.length; k++) initials[k].textContent = initial;
    }

    function isAdmin(user) {
        return !!user && user.role === "admin";
    }

    window.LoveLuxeSession = {
        read: read,
        save: save,
        clear: clear,
        apply: apply,
        isAdmin: isAdmin
    };

    var user = read();

    /* Top-level admin pages need a logged-in admin, otherwise go to login */
    if (document.documentElement.hasAttribute("data-require-admin") &&
        window.parent === window && !isAdmin(user)) {
        window.location.replace("login.html");
        return;
    }

    /* When shown inside the portal iframe, the portal sends the session */
    window.addEventListener("message", function (event) {
        if (window.parent === window || event.source !== window.parent) return;
        if (!event.data || event.data.type !== "love-luxe-session") return;
        apply(event.data.user);
    });

    function paint() { apply(read()); }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", paint);
    } else {
        paint();
    }
})();
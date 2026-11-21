(function () {
    "use strict";

    var CHIPS = ["All", "Music", "Tamil cinema", "Indian pop music", "Live", "Gaming", "Cricket", "Travel", "Coding"];
    var app = document.getElementById("app");
    var $ = function (id) { return document.getElementById(id); };
    var cache = {}; // id -> video

    // ---------- helpers ----------
    function esc(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }
    function store(key, val) {
        try {
            if (val === undefined) return JSON.parse(localStorage.getItem(key));
            localStorage.setItem(key, JSON.stringify(val));
        } catch (e) { return null; }
    }
    function fmtCount(n) {
        n = Number(n) || 0;
        if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
        if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
        if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
        return String(n);
    }
    function ago(iso) {
        var s = (Date.now() - new Date(iso).getTime()) / 1000;
        var u = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
        for (var i = 0; i < u.length; i++) {
            var n = Math.floor(s / u[i][1]);
            if (n >= 1) return n + " " + u[i][0] + (n > 1 ? "s" : "") + " ago";
        }
        return "just now";
    }
    function hue(str) { var h = 0; str = String(str); for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360; return h; }
    function avatarHtml(name, cls) {
        return '<span class="avatar ' + (cls || "") + '" style="background:hsl(' + hue(name) + ',50%,40%)">' + esc(String(name || "?").charAt(0)) + '</span>';
    }
    function timeAgoText(v) { return v.publishedAt ? ago(v.publishedAt) : (v.published || ""); }
    function thumbOf(v) { return v.thumb || "https://i.ytimg.com/vi/" + encodeURIComponent(v.id) + "/hqdefault.jpg"; }
    function remember(list) { list.forEach(function (v) { cache[v.id] = Object.assign(cache[v.id] || {}, v); }); return list; }
    function parseHash() {
        var h = location.hash.replace(/^#/, "") || "/";
        var parts = h.split("?");
        var params = {};
        (parts[1] || "").split("&").forEach(function (kv) {
            if (!kv) return;
            var p = kv.split("=");
            params[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || "").replace(/\+/g, " "));
        });
        return { path: parts[0], params: params };
    }

    // ---------- data layer ----------
    function getHome(cat) { return Promise.resolve(filterLocal(cat)); }
    function search(q) { return Promise.resolve(filterLocal(q)); }
    function filterLocal(q) {
        var all = remember(window.SAMPLE_VIDEOS.slice());
        if (!q || q === "All") return all;
        var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
        return all.filter(function (v) {
            var hay = (v.title + " " + v.channel + " " + v.tags.join(" ")).toLowerCase();
            return terms.every(function (t) { return hay.indexOf(t) !== -1; });
        });
    }
    function getVideo(id) {
        remember(window.SAMPLE_VIDEOS.slice());
        return Promise.resolve(cache[id] || store("yt:video:" + id) || { id: id, title: "Video", channel: "" });
    }
    function getRelated(v) {
        return Promise.resolve(filterLocal().filter(function (x) { return x.id !== v.id; }));
    }

    // ---------- user state ----------
    var S = {
        liked: function () { return store("yt:liked") || {}; },
        subs: function () { return store("yt:subs") || {}; },
        history: function () { return store("yt:history") || []; },
        comments: function (id) { return store("yt:comments:" + id) || []; }
    };
    function saveVideo(v) { store("yt:video:" + v.id, v); }
    function addHistory(v) {
        var h = S.history().filter(function (id) { return id !== v.id; });
        h.unshift(v.id);
        store("yt:history", h.slice(0, 50));
        saveVideo(v);
    }
    function savedVideo(id) { return cache[id] || store("yt:video:" + id); }

    // ---------- views ----------
    function cardHtml(v) {
        var meta = [];
        if (v.views != null) meta.push(fmtCount(v.views) + " views");
        if (timeAgoText(v)) meta.push(timeAgoText(v));
        var href = "#/watch?v=" + esc(v.id);
        return '<article class="card">' +
            '<a class="card__thumb" href="' + href + '" tabindex="-1" aria-hidden="true"><img src="' + esc(thumbOf(v)) + '" alt="" loading="lazy">' +
            '</a>' +
            '<div class="card__info">' + avatarHtml(v.channel, "avatar--lg") +
            '<div class="card__text"><a href="' + href + '"><h3>' + esc(v.title) + '</h3></a>' +
            '<p class="meta">' + esc(v.channel) + '<br>' + esc(meta.join(" · ")) + '</p></div>' +
            '<button class="icon-btn icon-btn--sm" aria-label="Action menu"><i class="fa-solid fa-ellipsis-vertical"></i></button></div></article>';
    }
    function gridHtml(list, empty) {
        if (!list.length) return '<p class="empty">' + esc(empty || "No videos found.") + '</p>';
        return '<section class="video-grid">' + list.map(cardHtml).join("") + '</section>';
    }
    function skeletonHtml(n) {
        var one = '<article class="card skel"><div class="card__thumb"></div><div class="card__info"><span class="avatar avatar--lg"></span><div class="card__text"><i></i><i></i></div></div></article>';
        var out = ""; for (var k = 0; k < n; k++) out += one;
        return '<section class="video-grid" aria-busy="true">' + out + '</section>';
    }
    function chipsHtml(active) {
        var chips = CHIPS.filter(function (c) { return c === "All" || filterLocal(c).length; });
        return '<div class="chips">' + chips.map(function (c) {
            var on = (active || "All") === c;
            return '<a class="chip' + (on ? " chip--active" : "") + '" href="#/' + (c === "All" ? "" : "?cat=" + encodeURIComponent(c)) + '">' + esc(c) + '</a>';
        }).join("") + '</div>';
    }
    function notice(html) { return '<div class="notice">' + html + '</div>'; }
    function setError(e) { app.innerHTML = notice("Something went wrong: " + esc(e.message || e)); }
    var token = 0; // ignore stale async renders
    function guard() { var t = ++token; return function () { return t === token; }; }

    function renderHome(params) {
        var cat = params.cat || "All", ok = guard();
        app.innerHTML = chipsHtml(cat) + skeletonHtml(8);
        getHome(cat).then(function (list) {
            if (ok()) app.innerHTML = chipsHtml(cat) + gridHtml(list, "No videos match this category.");
        }).catch(function (e) { if (ok()) setError(e); });
    }
    function renderSearch(params) {
        var q = params.q || "", ok = guard();
        app.innerHTML = '<h2 class="page-title">Results for "' + esc(q) + '"</h2>' + skeletonHtml(6);
        search(q).then(function (list) {
            if (ok()) app.innerHTML = '<h2 class="page-title">Results for "' + esc(q) + '"</h2>' + gridHtml(list, 'No results for "' + q + '".');
        }).catch(function (e) { if (ok()) setError(e); });
    }
    function renderLiked() {
        var l = S.liked();
        var list = Object.keys(l).filter(function (k) { return l[k] === 1; }).map(savedVideo).filter(Boolean);
        app.innerHTML = '<h2 class="page-title">Liked videos</h2>' + gridHtml(list, "Videos you like will show up here.");
    }
    function renderHistory() {
        var list = S.history().map(savedVideo).filter(Boolean);
        app.innerHTML = '<h2 class="page-title">Watch history</h2>' +
            (list.length ? '<button class="pill" id="clearHist">Clear all watch history</button>' : "") +
            gridHtml(list, "Videos you watch will show up here.");
        var b = $("clearHist");
        if (b) b.onclick = function () { store("yt:history", []); renderHistory(); };
    }
    function renderSubs() {
        var chans = Object.keys(S.subs());
        if (!chans.length) { app.innerHTML = '<h2 class="page-title">Subscriptions</h2><p class="empty">Subscribe to a channel on a video page and its videos will show up here.</p>'; return; }
        var seen = {};
        S.history().forEach(function (id) { seen[id] = savedVideo(id); });
        Object.keys(cache).forEach(function (id) { seen[id] = cache[id]; });
        var list = Object.keys(seen).map(function (k) { return seen[k]; }).filter(function (v) { return v && S.subs()[v.channel]; });
        app.innerHTML = '<h2 class="page-title">Subscriptions</h2>' + gridHtml(list, "No videos from your subscribed channels yet.");
    }
    function paintSideSubs() {
        var chans = Object.keys(S.subs());
        $("sideSubs").innerHTML = chans.length
            ? '<hr><h4>Subscriptions</h4><ul>' + chans.map(function (c) {
                return '<li><a class="side-item" href="#/search?q=' + encodeURIComponent(c) + '">' + avatarHtml(c, "avatar--sm") + '<span>' + esc(c) + '</span></a></li>';
            }).join("") + '</ul>'
            : "";
    }

    function renderWatch(params) {
        var id = params.v, ok = guard();
        if (!id) { location.hash = "#/"; return; }
        app.innerHTML = '<div class="loading"><i class="fa-solid fa-spinner fa-spin"></i></div>';
        getVideo(id).then(function (v) {
            if (!ok()) return;
            addHistory(v);
            document.title = v.title + " - YouTube Clone";
            var views = (v.views != null ? v.views.toLocaleString() + " views · " : "") + timeAgoText(v);
            app.innerHTML =
                '<div class="watch"><div class="watch__main">' +
                '<div class="player"><iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&rel=0" title="' + esc(v.title) + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>' +
                '<h1 class="watch__title">' + esc(v.title) + '</h1>' +
                '<div class="watch__bar"><div class="channel">' + avatarHtml(v.channel, "avatar--lg") +
                '<span class="channel__name">' + esc(v.channel) + '</span><button class="pill pill--dark" id="subBtn"></button></div>' +
                '<div class="actions"><div class="seg"><button class="pill" id="likeBtn"></button><button class="pill" id="dislikeBtn" aria-label="Dislike"><i class="fa-regular fa-thumbs-down"></i></button></div>' +
                '<button class="pill" id="shareBtn"><i class="fa-solid fa-share"></i> Share</button></div></div>' +
                '<div class="desc" id="desc"><b>' + esc(views) + '</b><p>' + esc(v.description || "No description.").replace(/\n/g, "<br>") + '</p><button class="desc__more" id="descMore">...more</button></div>' +
                '<section class="comments"><h3 id="cCount"></h3>' +
                '<form id="cForm" class="cform">' + avatarHtml("You", "avatar--lg") +
                '<div class="cform__field"><input id="cInput" placeholder="Add a comment..." aria-label="Add a comment" maxlength="500" autocomplete="off">' +
                '<div class="cform__btns"><button type="button" class="pill" id="cCancel">Cancel</button><button class="pill pill--dark" id="cSubmit" disabled>Comment</button></div></div></form>' +
                '<div id="cList"></div></section></div>' +
                '<aside class="watch__side" id="related"><h3>Up next</h3></aside></div>';
            wireWatch(v);
            getRelated(v).then(function (l) {
                var el = $("related");
                if (!el || !ok()) return;
                el.innerHTML = '<h3>Up next</h3>' + l.slice(0, 12).map(function (r) {
                    return '<a class="rel" href="#/watch?v=' + esc(r.id) + '"><img src="' + esc(thumbOf(r)) + '" alt="" loading="lazy"><div><h4>' + esc(r.title) + '</h4><p class="meta">' + esc(r.channel) + '<br>' + esc(r.views != null ? fmtCount(r.views) + " views" : "") + '</p></div></a>';
                }).join("");
            }).catch(function () { var el = $("related"); if (el) el.innerHTML = ""; });
        }).catch(function (e) { if (ok()) setError(e); });
    }

    function wireWatch(v) {
        var likeBtn = $("likeBtn"), disBtn = $("dislikeBtn"), subBtn = $("subBtn");
        function paint() {
            var state = S.liked()[v.id] || 0;
            var n = (v.likes || 0) + (state === 1 ? 1 : 0);
            likeBtn.innerHTML = '<i class="fa-' + (state === 1 ? "solid" : "regular") + ' fa-thumbs-up"></i> ' + (n ? fmtCount(n) : "Like");
            disBtn.firstChild.className = "fa-" + (state === -1 ? "solid" : "regular") + " fa-thumbs-down";
            var subbed = !!S.subs()[v.channel];
            subBtn.textContent = subbed ? "Subscribed" : "Subscribe";
            subBtn.classList.toggle("pill--dark", !subbed);
        }
        function setLike(val) {
            var l = S.liked();
            if (l[v.id] === val) delete l[v.id]; else l[v.id] = val;
            store("yt:liked", l); saveVideo(v); paint();
        }
        likeBtn.onclick = function () { setLike(1); };
        disBtn.onclick = function () { setLike(-1); };
        subBtn.onclick = function () {
            var s = S.subs();
            if (s[v.channel]) delete s[v.channel]; else s[v.channel] = true;
            store("yt:subs", s); saveVideo(v); paint(); paintSideSubs();
        };
        $("shareBtn").onclick = function (e) {
            var url = "https://youtu.be/" + v.id, b = e.currentTarget;
            var done = function () { b.textContent = "Link copied!"; setTimeout(function () { b.innerHTML = '<i class="fa-solid fa-share"></i> Share'; }, 1500); };
            if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { window.prompt("Copy link:", url); });
            else window.prompt("Copy link:", url);
        };
        $("descMore").onclick = function () {
            var d = $("desc"), open = d.classList.toggle("open");
            this.textContent = open ? "Show less" : "...more";
        };
        paint();

        var form = $("cForm"), input = $("cInput"), submit = $("cSubmit");
        function paintComments() {
            var list = S.comments(v.id);
            $("cCount").textContent = list.length + " Comment" + (list.length === 1 ? "" : "s");
            $("cList").innerHTML = list.map(function (c) {
                return '<div class="comment">' + avatarHtml("You", "avatar--lg") + '<div><b>@you</b><span class="meta">' + esc(ago(c.t)) + '</span><p>' + esc(c.text) + '</p></div></div>';
            }).join("");
        }
        input.addEventListener("input", function () {
            var has = !!input.value.trim();
            submit.disabled = !has; form.classList.toggle("has-text", has);
        });
        $("cCancel").onclick = function () { input.value = ""; submit.disabled = true; form.classList.remove("has-text"); input.blur(); };
        form.onsubmit = function (e) {
            e.preventDefault();
            var text = input.value.trim();
            if (!text) return;
            var list = S.comments(v.id);
            list.unshift({ text: text, t: new Date().toISOString() });
            store("yt:comments:" + v.id, list);
            input.value = ""; submit.disabled = true; form.classList.remove("has-text");
            paintComments();
        };
        paintComments();
    }

    // ---------- router ----------
    function route() {
        var r = parseHash(), b = document.body;
        document.title = "YouTube Clone";
        b.classList.toggle("is-watch", r.path === "/watch");
        b.classList.remove("menu-open", "search-open");
        window.scrollTo(0, 0);
        if (r.path === "/search") { $("searchInput").value = r.params.q || ""; syncClear(); }
        var links = document.querySelectorAll("[data-nav]");
        for (var i = 0; i < links.length; i++) {
            var nav = links[i].getAttribute("data-nav");
            var active = (nav === "home" && (r.path === "/" || r.path === "")) || ("/" + nav === r.path);
            links[i].classList.toggle("active", active);
        }
        paintSideSubs();
        switch (r.path) {
            case "/watch": return renderWatch(r.params);
            case "/search": return renderSearch(r.params);
            case "/liked": return renderLiked();
            case "/history": return renderHistory();
            case "/subscriptions": return renderSubs();
            default: return renderHome(r.params);
        }
    }

    // ---------- chrome ----------
    var input = $("searchInput");
    function syncClear() { $("searchClear").hidden = !input.value; }
    input.addEventListener("input", syncClear);
    $("searchClear").addEventListener("click", function () { input.value = ""; syncClear(); input.focus(); });
    $("searchForm").addEventListener("submit", function (e) {
        e.preventDefault();
        var q = input.value.trim();
        if (q) location.hash = "#/search?q=" + encodeURIComponent(q);
    });
    $("searchOpen").addEventListener("click", function () { document.body.classList.add("search-open"); input.focus(); });
    $("searchBack").addEventListener("click", function () { document.body.classList.remove("search-open"); });

    // Voice search (where supported)
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
        var mic = $("micBtn"); mic.hidden = false;
        mic.addEventListener("click", function () {
            var rec = new SR();
            rec.lang = "en-US";
            rec.onresult = function (ev) { input.value = ev.results[0][0].transcript; syncClear(); $("searchForm").requestSubmit(); };
            rec.onerror = rec.onend = function () { mic.classList.remove("listening"); };
            try { rec.start(); mic.classList.add("listening"); } catch (e) { /* already running */ }
        });
    }

    $("menuBtn").addEventListener("click", function () {
        var b = document.body;
        if (window.innerWidth <= 1000 || b.classList.contains("is-watch")) b.classList.toggle("menu-open");
        else b.classList.toggle("sidebar-collapsed");
    });
    $("scrim").addEventListener("click", function () { document.body.classList.remove("menu-open"); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") document.body.classList.remove("menu-open", "search-open"); });
    window.addEventListener("resize", function () { if (window.innerWidth > 1000) document.body.classList.remove("menu-open"); });

    var root = document.documentElement;
    var savedTheme = store("yt:theme");
    if (savedTheme) root.setAttribute("data-theme", savedTheme);
    function isDark() {
        var t = root.getAttribute("data-theme");
        return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    function paintTheme() {
        document.querySelector("#themeBtn i").className = isDark() ? "fa-solid fa-sun" : "fa-solid fa-moon";
        var m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = isDark() ? "#0f0f0f" : "#ffffff";
    }
    $("themeBtn").addEventListener("click", function () {
        var next = isDark() ? "light" : "dark";
        root.setAttribute("data-theme", next); store("yt:theme", next); paintTheme();
    });
    paintTheme();

    window.addEventListener("hashchange", route);
    route();
})();

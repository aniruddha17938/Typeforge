"""TypeForge - Custom Typing Test Platform (Flask backend)."""
import os, random, re, sqlite3
from flask import Flask, g, jsonify, render_template, request

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", os.urandom(24).hex())
DB = os.path.join(os.path.dirname(__file__), "typing.db")

# ---------- database (SQLite, parameterised queries only) ----------
def db():
    if "db" not in g:
        g.db = sqlite3.connect(DB)
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_db(_):
    d = g.pop("db", None)
    if d:
        d.close()

with sqlite3.connect(DB) as c:
    c.execute("""CREATE TABLE IF NOT EXISTS attempts(
        id INTEGER PRIMARY KEY, created TEXT DEFAULT CURRENT_TIMESTAMP,
        mode TEXT, category TEXT, difficulty TEXT, duration INTEGER, lines INTEGER,
        timer TEXT, gross REAL, net REAL, accuracy REAL, kpm REAL,
        correct INTEGER, incorrect INTEGER, taken REAL, reason TEXT)""")

# ---------- text banks ----------
EASY = "the of and to in is it you that he was for on are with as his they be at one have this from or had by hot but some what there we can out other were all your when up use word how said an each she which do their time if will way about many then them write would like so these her long make thing see him two has look more day could go come did number sound most people my over know water than call first who may down side been now find".split()
MED = "customer problem account service request payment update message balance support process manager receive confirm delivery product system report schedule address contact resolve review order refund policy session network billing history invoice feature profile notice account".split()
HARD = "necessary environment particularly responsibility accommodate entrepreneur questionnaire acknowledgement miscellaneous conscientious infrastructure synchronize authentication reconciliation discrepancy subscription implementation correspondence troubleshooting unavailable escalation configuration verification experience".split()
WORDS = {"easy": EASY, "medium": MED, "hard": HARD}

SENT = {
 "support": ["Thank you for contacting us.", "I understand how frustrating this must be.", "Let me check your account details right away.", "Could you please confirm the email address linked to your account?", "I have escalated your request to our technical team, and they will respond within 24 hours.", "We apologise for the inconvenience and will process your refund within 5 business days.", "Please restart the application and let us know if the problem continues.", "Your order was dispatched on Monday and should reach you by Friday afternoon."],
 "chat": ["Hi, thanks for reaching out!", "Sure, I can help with that.", "Give me a moment while I look into it.", "Is there anything else I can help you with today?", "I have just reset your password, so please check your inbox for the new link.", "Thanks for waiting, I found the payment and it is marked as pending.", "Happy to help, and have a wonderful day!", "I can see the charge on your statement and I will raise a dispute for you now."],
 "email": ["Dear Customer, I hope this message finds you well.", "I am writing to confirm that your subscription has been renewed.", "Please find the invoice attached for your records.", "Kindly let me know a convenient time to schedule the review meeting.", "Thank you for your patience while we investigated the issue you reported last week.", "Should you have any further questions, please do not hesitate to contact me.", "Best regards, the Support Team.", "Following our discussion yesterday, I have summarised the agreed next steps below."],
 "ticket": ["Customer reports that the login page shows an error after entering valid credentials.", "Issue: invoice 4821 was charged twice on the same card.", "Steps to reproduce: open settings, click export, and the page freezes.", "The mobile app crashes when uploading photos larger than 10 MB.", "Customer requests a refund for order 9034 because the item arrived damaged.", "Priority is high because the checkout page has been unavailable since this morning.", "Resolved: password reset email was blocked by the spam filter.", "Awaiting customer reply with a screenshot of the error message."],
 "passage": ["Learning to type quickly is a skill that rewards steady practice more than raw speed.", "Good typists keep their eyes on the screen and let their fingers find the keys by memory.", "Accuracy matters more than speed at first, because every mistake costs time to correct.", "Short daily sessions build muscle memory far better than one long session each week.", "A relaxed posture, straight wrists and an even rhythm help prevent fatigue during long tests.", "Over time, common words become single motions rather than a series of separate letters.", "Employers often measure typing ability because it reflects focus, consistency and care.", "The best way to improve is to review your mistakes and slow down until they disappear."],
}
NUMERIC = ("numbers", "sequences", "special", "currency", "math", "mixed")
DIFFS = ("easy", "medium", "hard")

def gen_numeric(cat, n):
    r, out = random, []
    for _ in range(n):
        if cat == "numbers": out.append(str(r.randint(10, 99999)))
        elif cat == "sequences": out.append("".join(r.choices("0123456789", k=10)))
        elif cat == "special": out.append("".join(r.choices("@#$%&*!?+=", k=r.randint(3, 5))))
        elif cat == "currency": out.append(r.choice("₹$€£") + str(r.randint(5, 999)))
        elif cat == "math": out.append(f"{r.randint(1,99)}{r.choice('+-*/=%')}{r.randint(1,99)}")
        else: out.append("".join(f"{r.choice('ABCDEFGH')}{r.randint(10,99)}{r.choice('@#$%&')}" for _ in range(2)))
    return " ".join(out)

def gen_text(cat, diff, n, caps, punct, nums, gram):
    if cat == "words":
        ws = [random.choice(WORDS[diff]) for _ in range(n)]
        if punct:
            for i in range(5, n, 7): ws[i] += random.choice([",", ".", ";"])
            ws[-1] = ws[-1].rstrip(",.;") + "."
        text = " ".join(ws)
    else:
        pool = SENT[cat]
        f = [s for s in pool if (len(s.split()) <= 9) == (diff == "easy")] if diff != "medium" else pool
        pool, out, count = (f or pool), [], 0
        while count < n:
            bag = random.sample(pool, len(pool))
            for s in bag:
                out.append(s); count += len(s.split())
                if count >= n: break
        text = " ".join(out)
    if nums:
        ws = text.split(" ")
        for i in range(7, len(ws), 9): ws[i] = str(random.randint(1, 9999))
        text = " ".join(ws)
    if not punct: text = re.sub(r"[^\w\s]", "", text)
    if not caps: text = text.lower()
    return text

# ---------- routes ----------
@app.get("/")
def index():
    return render_template("index.html")

@app.get("/api/content")
def content():
    a = request.args
    try:
        n = max(1, min(int(a.get("n", 250)), 2000))
    except ValueError:
        return jsonify(error="Invalid word count."), 400
    mode, cat, diff = a.get("mode", "timed"), a.get("cat", "words"), a.get("diff", "medium")
    flag = lambda k: a.get(k) == "1"
    if mode == "numeric":
        if a.get("ncat") not in NUMERIC: return jsonify(error="Unknown numeric category."), 400
        return jsonify(text=gen_numeric(a["ncat"], n))
    if cat not in SENT and cat != "words": return jsonify(error="Unknown category."), 400
    if diff not in DIFFS: return jsonify(error="Unknown difficulty."), 400
    if cat == "words" and flag("gram"):
        return jsonify(error="'Grammatically correct sentences' cannot be used with Random Words."), 400
    return jsonify(text=gen_text(cat, diff, n, flag("caps"), flag("punct"), flag("nums"), flag("gram")))

@app.post("/api/custom")
def custom():
    t = re.sub(r"\s+", " ", str((request.get_json(silent=True) or {}).get("text", ""))).strip()
    t = "".join(ch for ch in t if ch.isprintable())
    if len(t) < 20: return jsonify(error="Custom text must be at least 20 characters."), 400
    if len(t) > 20000: return jsonify(error="Custom text is limited to 20,000 characters."), 400
    return jsonify(text=t)  # rendered client-side with textContent, so no XSS

@app.post("/api/results")
def save_result():
    d = request.get_json(silent=True) or {}
    try:
        row = (str(d["mode"])[:20], str(d["category"])[:30], str(d["difficulty"])[:10], int(d["duration"]),
               int(d["lines"]), str(d["timer"])[:10], float(d["gross"]), float(d["net"]), float(d["accuracy"]),
               float(d.get("kpm", 0)), int(d["correct"]), int(d["incorrect"]), float(d["taken"]), str(d["reason"])[:40])
    except (KeyError, ValueError, TypeError):
        return jsonify(error="Invalid result data."), 400
    db().execute("""INSERT INTO attempts(mode,category,difficulty,duration,lines,timer,gross,net,accuracy,kpm,
                    correct,incorrect,taken,reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", row)
    db().commit()
    return jsonify(ok=True)

@app.get("/api/history")
def history():
    rows = db().execute("SELECT * FROM attempts ORDER BY id DESC LIMIT 50").fetchall()
    return jsonify([dict(r) for r in rows])

if __name__ == "__main__":
    app.run(debug=True)

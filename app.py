import os
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy

app = Flask(
    __name__,
    static_folder="static",
    template_folder="templates"
)

app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret")
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get(
    "DATABASE_URL", "sqlite:///app.db"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)

class User(db.Model):
    id            = db.Column(db.Integer, primary_key=True)
    email         = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)

@app.route("/")
def home():
    return render_template("index.html")

# <-- New route to serve your mockup -->
@app.route("/livemockup.html")
def live_mockup():
    return render_template("livemockup.html")

# <-- New route to serve your mockup -->
@app.route("/leatr.html")
def sysleatr():
    return render_template("leatr.html")

# <-- New route to serve your mockup -->
@app.route("/brpn.html")
def lvbrpn():
    return render_template("brpn.html")
    
# <-- New route to serve your mockup -->
@app.route("/amino.html")
def lvamino():
    return render_template("amino.html")

# <-- New route to serve your mockup -->
@app.route("/leatrproto.html")
def sysprotoleatr():
    return render_template("leatrproto.html")

# <-- New route to serve your mockup -->
@app.route("/mn.html")
def sysmn():
    return render_template("mn.html")
# <-- New route to serve your mockup -->
@app.route("/altitude.html")
def sysalt():
    return render_template("altitude.html")
# <-- New route to serve your mockup -->
@app.route("/arcmeadow.html")
def sysamd():
    return render_template("arcmeadow.html")

# <-- New route to serve your mockup -->
@app.route("/dartedgeaiide.html")
def syside():
    return render_template("dartedgeaiide.html")
# <-- New route to serve your mockup -->
@app.route("/leaudiovisualizer.html")
def sysleav():
    return render_template("leaudiovisualizer.html")

@app.route("/ar.html")
def ar():
    return render_template("ar.html")

@app.route("/Mockup.html")
def mockup():
    return render_template("Mockup.html")

@app.route("/arielorg.html")
def arielorg():
    return render_template("arielorg.html")

@app.route("/intermit.html")
def intermit():
    return render_template("intermit.html")

@app.route("/leatrprotoliveorg.html")
def leatrprotoliveorg():
    return render_template("leatrprotoliveorg.html")

@app.route("/lemazeashbackup.html")
def lemazeashbackup():
    return render_template("lemazeashbackup.html")

@app.route("/ppreferenceform.html")
def ppreferenceform():
    return render_template("ppreferenceform.html")

@app.route("/testbkp.html")
def testbkp():
    return render_template("testbkp.html")

@app.route("/ai_studio_code (25).html")
def ai_studio_code():
    return render_template("ai_studio_code (25).html")

@app.route("/api/chat", methods=["POST"])
def chat():
    payload = request.get_json() or {}
    user_msg = payload.get("message", "").strip()
    if not user_msg:
        return jsonify({"reply": ""})
    # reply = bot.send(user_msg)
    reply = f"You said: {user_msg}"
    return jsonify({"reply": reply})

@app.route('/feed.xml')
def feed():

    return send_from_directory('static', 'feed.xml')
    

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
    

import os
from flask import Flask, render_template, request, jsonify
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

@app.route("/api/chat", methods=["POST"])
def chat():
    payload = request.get_json() or {}
    user_msg = payload.get("message", "").strip()
    if not user_msg:
        return jsonify({"reply": ""})
    # reply = bot.send(user_msg)
    reply = f"You said: {user_msg}"
    return jsonify({"reply": reply})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
    

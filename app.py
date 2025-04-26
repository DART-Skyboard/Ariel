import os
from flask import Flask, render_template
from flask_sqlalchemy import SQLAlchemy

# By default Flask will look in ./templates for HTML,
# and ./static for static files, so you only
# need to override if you’ve renamed those folders.
app = Flask(__name__,
            static_folder="static",
            template_folder="templates")

# you can give defaults here so it still runs locally
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret")
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL", "sqlite:///app.db")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)

class User(db.Model):
    id            = db.Column(db.Integer, primary_key=True)
    email         = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)

@app.route("/")
def home():
    # this was 'templates("index.html")' before, which doesn’t exist
    return render_template("index.html")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)

import os
from flask import Flask, render_template
from flask_sqlalchemy import SQLAlchemy

app = Flask(
    __name__,
    static_folder='static',
    template_folder='templates'
)

#  ─── Configuration ────────────────────────────────────────────────────────
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key')
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get(
    'DATABASE_URL',
    'sqlite:///autumn.db'
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

#  ─── Database ──────────────────────────────────────────────────────────────
db = SQLAlchemy(app)

class User(db.Model):
    id       = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(128), unique=True, nullable=False)

#  ─── Routes ────────────────────────────────────────────────────────────────
@app.route('/')
def home():
    # Make sure you have a file at templates/index.html
    return render_template('index.html')

#  ─── Launch ───────────────────────────────────────────────────────────────
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)

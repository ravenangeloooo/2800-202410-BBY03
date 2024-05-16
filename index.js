require("./utils.js");

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
// const bcrypt = require('bcrypt');
const saltRounds = 12;

const port = process.env.PORT || 3000;

const app = express();

const Joi = require("joi");

const expireTime = 1 * 60 * 60 * 1000; //expires after 1 hour  (hour * minutes * seconds * millis)

/* secret information section */
const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_database = process.env.MONGODB_DATABASE;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;

const node_session_secret = process.env.NODE_SESSION_SECRET;
/* END secret section */    

var { database } = include('databaseConnection');

const userCollection = database.db(mongodb_database).collection('users');

app.use(express.urlencoded({ extended: false }));

app.set("view engine", "ejs");

var mongoStore = MongoStore.create({
    mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/sessions`,
    crypto: {
        secret: mongodb_session_secret
    }
})

function isValidSession(req) {
    return req.session.authenticated;
}

function sessionValidation(req, res, next) {
    if (isValidSession(req)) {
        next();
    }
    else {
        res.redirect('/');
    }
}






app.use(session({
    secret: node_session_secret,
    store: mongoStore, //default is memory store 
    saveUninitialized: false,
    resave: true
}
));



app.get('/', (req, res) => {
    var user = isValidSession(req);
    res.render('index');
});

app.get('/signup', (req, res) => {
    res.render('signup');
});

app.get('/collections', (req,res) => {
    res.render('items');
})

app.get('/requests', (req,res) => {
    res.render('requests');
})

// Step 3: Log in page
app.get('/login', (req, res) => {
    res.render("login");
});


app.post('/loggingin', async (req, res) => {
    var email = req.body.email;
    var password = req.body.password;

    
    const emailSchema = Joi.string().email().required();
    const { error: emailError } = emailSchema.validate(email);
    if (emailError) {
        console.log(emailError);
        return res.redirect("/login");
    }

    // Find user by email in the database
    const user = await userCollection.findOne({ email: email });
    if (!user) {
        console.log("User not found");
        return res.redirect("/login");
    }

    // Compare passwords
    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (isPasswordCorrect) {
        console.log("Correct password");
        // Store user information in session
        req.session.authenticated = true;
        req.session.user_type =user.user_type;
        req.session.email = email;
        req.session.name = user.name; // Store user's name in the session
        req.session.cookie.maxAge = expireTime;
        return res.redirect('/home');
    } else {
        // Incorrect password
        return res.send(`
            <h1>Incorrect password</h1>
            <a href="/login">Try again</a>
        `);
    }
});





app.use(express.static(__dirname + "/public"));

app.get("*", (req, res) => {
    res.status(404);
    res.render('404');
})

app.listen(port, () => {
    console.log("Node application listening on port " + port);
}); 
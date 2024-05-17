require("./utils.js");

require("dotenv").config();
const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const bcrypt = require("bcrypt");
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

var { database } = include("databaseConnection");

const userCollection = database.db(mongodb_database).collection("users");

app.use(express.urlencoded({ extended: false }));

app.set("view engine", "ejs");

var mongoStore = MongoStore.create({
  mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/sessions`,
  crypto: {
    secret: mongodb_session_secret,
  },
});

function isValidSession(req) {
  return req.session.authenticated;
}

function sessionValidation(req, res, next) {
  if (isValidSession(req)) {
    next();
  } else {
    res.redirect("/login");
  }
}

app.use(
  session({
    secret: node_session_secret,
    store: mongoStore, //default is memory store
    saveUninitialized: false,
    resave: true,
  })
);

app.get("/", sessionValidation, (req, res) => {
  res.render("index");
});

//Sign up for a new account
app.get("/signup", (req, res) => {
  res.render("signup");
});

app.get("/collections", (req, res) => {
  res.render("items");
});

app.get("/requests", (req, res) => {
  res.render("requests");
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});
// reset password
app.get("/resetPassword", (req, res) => {
  res.render("resetPassword");
});

app.post("/resetPassword", async (req, res) => {
  var email = req.body.email;
  var birthdate = req.body.date;
  var newPassword = req.body.newPassword;

  const schema = Joi.object({
    email: Joi.string().email().required(),
    birthdate: Joi.date().iso().required(),
    newPassword: Joi.string().max(20).required(),
  });

  const validationResult = schema.validate({ email, birthdate, newPassword });

  if (validationResult.error != null) {
    console.log(validationResult.error);

    var error = validationResult.error.details[0].context.label;
    var errormessage = error.charAt(0).toUpperCase() + error.slice(1);

    res.render("resetError", { errormessage: errormessage });
  } else {
    // Find user by email and birthdate in the database
    const user = await userCollection.findOne({
      email: email,
      birthdate: birthdate,
    });
    if (!user) {
      console.log("User not found");
      return res.render("userNotFound");
    }

    // Hash the new password and update it in the database
    var hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    await userCollection.updateOne(
      { email: email, birthdate: birthdate },
      { $set: { password: hashedPassword } }
    );
    console.log("Password updated");

    return res.render("resetSuccess");
  }
});

app.get("/editItem", sessionValidation, (req, res) => {
  res.render("editItem");
});

app.get("/editRequest", sessionValidation, (req, res) => {
  res.render("editRequest");
});

//Post page
app.get("/post", sessionValidation, (req, res) => {
  res.render("post");
});

//Group page
app.get("/groups", sessionValidation, (req, res) => {
  res.render("groups");
});

//Profile page
app.get("/profile", sessionValidation, (req, res) => {
    console.log(req.session)

  res.render("profile", {
    user: {
      name: req.session.name,
      email: req.session.email,
      birthdate: req.session.birthdate,
    },
  });
});

app.get("/postItem", sessionValidation, (req, res) => {
  res.render("postItem");
});

app.get("/postRequest", sessionValidation, (req, res) => {
  res.render("postRequest");
});

app.get("/editItem", sessionValidation, (req, res) => {
  res.render("editItem");
});

app.get("/editRequest", sessionValidation, (req, res) => {
  res.render("editRequest");
});

//Signup form posts the form fields and validates all inputs
app.post("/signupSubmit", async (req, res) => {
  var username = req.body.username;
  var email = req.body.email;
  var password = req.body.password;
  var birthdate = req.body.date;

  const schema = Joi.object({
    username: Joi.string().alphanum().max(20).required(),
    email: Joi.string().email().required(),
    password: Joi.string().max(20).required(),
    birthdate: Joi.date().iso().required(),
  });

  const validationResult = schema.validate({
    username,
    email,
    password,
    birthdate,
  });

  if (validationResult.error != null) {
    //Sends an error message saying which field was missing
    console.log(validationResult.error);

    var error = validationResult.error.details[0].context.label;
    var errormessage = error.charAt(0).toUpperCase() + error.slice(1);

    res.render("submitError", { errormessage: errormessage });
  } else {
    //If the 3 fields are non-empty, adds the user to MongoDB database.
    var hashedPassword = await bcrypt.hash(password, saltRounds);
    console.log("hashedPassword:" + hashedPassword);

    await userCollection.insertOne({
      username: username,
      email: email,
      password: hashedPassword,
      user_type: "user",
      birthdate: birthdate,
    });
    console.log("User Created:" + username);

    //Creates session and redirects the user to the /members page

    req.session.authenticated = true;
    req.session.user_type = "user";
    req.session.email = email;
    req.session.name = username; // Store user's name in the session
    req.session.birthdate = birthdate;
    req.session.cookie.maxAge = expireTime;

    res.redirect("/");
    return;
  }
});

//Discover Groups page
app.get("/discoverGroups", sessionValidation, (req, res) => {
  res.render("discoverGroups");
});

app.get("/peopleInterested", (req, res) => {
  res.render("peopleInterested");
});

app.get("/peopleOffering", (req, res) => {
  res.render("peopleOffering");
});

app.post("/loggingin", async (req, res) => {
  console.log("logging in");
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
  console.log(user)

  // Compare passwords
  const isPasswordCorrect = await bcrypt.compare(password, user.password);
  if (isPasswordCorrect) {
    console.log("Correct password");
    // Store user information in session
    req.session.authenticated = true;
    req.session.user_type = user.user_type;
    req.session.email = email;
    req.session.name = user.username; // Store user's name in the session
    req.session.birthdate = user.birthdate;
    req.session.cookie.maxAge = expireTime;
    return res.redirect("/");
  } else {
    // Incorrect password
    return res.render("loginError");
  }
});

app.get("/itemDetail", (req, res) => {
  const item = {
    itemName: "Name",
    userName: "User 2",
    itemDescription: "Brief description",
    itemCategory: "Category",
  };
  res.render("itemDetail", item);
});

app.use(express.static(__dirname + "/public"));

app.get("*", (req, res) => {
  res.status(404);
  res.render("404");
});

app.listen(port, () => {
  console.log("Node application listening on port " + port);
});

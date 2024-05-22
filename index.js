require("./utils.js");

require("dotenv").config();
const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const bcrypt = require("bcrypt");
const { v4: uuid } = require('uuid');
const mongodb = require('mongodb')

const saltRounds = 12;

const port = process.env.PORT || 3000;

const app = express();

const Joi = require("joi");

const expireTime = 168 * 60 * 60 * 1000; //expires after 1 hour  (hour * minutes * seconds * millis)

/* secret information section */
const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_database = process.env.MONGODB_DATABASE;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;

const node_session_secret = process.env.NODE_SESSION_SECRET;

const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;

/* END secret section */


/* Image database connection */
const cloudinary = require('cloudinary');
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_CLOUD_KEY,
    api_secret: process.env.CLOUDINARY_CLOUD_SECRET
});

const multer = require('multer')
const storage = multer.memoryStorage()
const upload = multer({ storage: storage })





var { database } = include("databaseConnection");

/* Database collection */
const userCollection = database.db(mongodb_database).collection("users");
const groupCollection = database.db(mongodb_database).collection("groups");
const itemCollection = database.db(mongodb_database).collection('items');
const requestCollection = database.db(mongodb_database).collection('myrequests');

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

app.get("/", sessionValidation, async (req, res) => {
  var user = isValidSession(req);
  let user_id = req.session.userId;

  // let items = await itemCollection.find({user_id: user_id}).toArray();

  let items = await itemCollection.find({ user_id: { $ne: user_id } }).toArray();
  console.log(items);
  res.render("index", { items: items });
});

app.get('/itemDetail', sessionValidation, async (req, res) => {
    let item_id = req.query.id;
    console.log(item_id);
    let item = await itemCollection.findOne({ _id: new mongodb.ObjectId(item_id) });
    console.log(item);
    let owner_id = item.user_id;
    console.log(owner_id);
    let owner = await userCollection.findOne({ _id: new mongodb.ObjectId(owner_id) });
    let owner_name = owner.displayname; 

    item['owner_name'] = owner_name;
    console.log(item);
    res.render('itemDetail', { item: item });
})


//Sign up for a new account
app.get("/signup", (req, res) => {
  res.render("signup");
});

app.get("/collections", sessionValidation, async (req, res) => {
    let user_id = req.session.userId;
    let items = await itemCollection.find({user_id: user_id}).toArray();
    console.log(items);
    res.render("items", {items: items});
    

});

app.get("/myRequests", sessionValidation, async (req, res) => {
  let user_id = req.session.userId;
  let requests = await requestCollection.find({user_id: user_id}).toArray();
    console.log(requests);
  
  res.render("myRequests", {requests: requests}); 
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.clearCookie("connect.sid");
  res.render("logout");
});

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
app.get('/post', sessionValidation, (req, res) => {
    res.render('post');
});

//Group page
app.get("/groups", sessionValidation, async (req, res) => {
  const userId = req.session.userId;

  const result = await groupCollection
    .find({ members: { $in: [userId] } })
    .project({ groupname: 1, _id: 1 })
    .toArray();
  console.log(result);

  //Capitalizes the first letter of each username
  result.forEach((group) => {
    group.groupname =
      group.groupname.charAt(0).toUpperCase() + group.groupname.slice(1);
  });

  res.render("groups", { groups: result });
});

//Profile page
app.get("/profile", sessionValidation, (req, res) => {
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

app.post('/itemSubmit', sessionValidation, upload.single('image'), function (req, res, next) {
    let image_uuid = uuid();
    let title = req.body.title;
    let description = req.body.description;
    let visibility = req.body.visibility;
    let user_id = req.session.userId;

    // let pet_id = req.body.pet_id;
    // let user_id = req.body.user_id;
    let buf64 = req.file.buffer.toString('base64');
    stream = cloudinary.uploader.upload("data:image/octet-stream;base64," + buf64, async function (result) {
    
        const success = await itemCollection.insertOne({ title: title, description: description, image_id: image_uuid, user_id: user_id, visibility: visibility});
        console.log("Item Created:" + title);   
    },
        { public_id: image_uuid }
    );
    console.log(req.body);
    console.log(req.file);
    res.redirect('/collections');
});



app.get("/postRequest", sessionValidation,(req, res) => {
  res.render("postRequest");
});

app.post("/submitRequest", sessionValidation, async(req,res) => {  
  const title = req.body.title;
  const description = req.body.description;
  const visibility = req.body.visibility;
  const user_id = req.session.userId;

  // const schema = Joi.object({
  //   title: Joi.string().max(50).required(),
  //   description: Joi.string().max(500).required(),
  // });


  const result = await requestCollection.insertOne({ user_id: user_id, title: title, description: description, visibility: visibility});
  console.log("request create: " + title);
  res.redirect('/collections');
})


app.get("/editItem", (req, res) => {
  res.render("editItem");
});

app.get("/editRequest", sessionValidation, (req, res) => {
  res.render("editRequest");
});

//Signup form posts the form fields and validates all inputs
app.post("/signupSubmit", async (req, res) => {
  var username = req.body.username;
  var displayname = req.body.displayname;
  var email = req.body.email;
  var password = req.body.password;
  var birthdate = req.body.date;

  const schema = Joi.object({
    username: Joi.string().alphanum().max(20).required(),
    displayname: Joi.string().max(20).required(),
    email: Joi.string().email().required(),
    password: Joi.string().max(20).required(),
    birthdate: Joi.date().iso().required(),
  });

  const validationResult = schema.validate({
    username,
    displayname,
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
      displayname: displayname,
      email: email,
      password: hashedPassword,
      user_type: "user",
      birthdate: birthdate,
    });

    var user = await userCollection.findOne({ email: email, username: username, birthdate: birthdate})

    console.log("User Created:" + username);

    //Creates session and redirects the user to the /members page
    req.session.authenticated = true;
    req.session.user_type = "user";
    req.session.email = email;
    req.session.name = username; // Store user's name in the session
    req.session.birthdate = birthdate;
    req.session.cookie.maxAge = expireTime;
    req.session.userId = user._id;

    res.redirect("/");
    return;
  }
});

//Discover Groups page
app.get("/discoverGroups", sessionValidation, async (req, res) => {
  const result = await groupCollection
    .find()
    .project({ groupname: 1, _id: 1 })
    .toArray();
  console.log(result);

  //Capitalizes the first letter of each username
  result.forEach((group) => {
    group.groupname =
      group.groupname.charAt(0).toUpperCase() + group.groupname.slice(1);
  });

  res.render("discoverGroups", { groups: result });
});

app.get("/peopleInterested", (req, res) => {
  res.render("peopleInterested");
});

app.get("/peopleOffering", (req, res) => {
  res.render("peopleOffering");
});

app.post("/loggingin", async (req, res) => {
  var username = req.body.username;
  var password = req.body.password;

  const usernameSchema = Joi.string().alphanum().required();
  const { error: usernameError } = usernameSchema.validate(username);
  if (usernameError) {
    console.log(usernameError);
    return res.redirect("/login");
  }

  // Find user by username in the database
  const user = await userCollection.findOne({ username: username });
  if (!user) {
    console.log("User not found");
    return res.render("loginError");
  }

  // Compare passwords
  const isPasswordCorrect = await bcrypt.compare(password, user.password);
  if (isPasswordCorrect) {
    console.log("Correct password");
    // Store user information in session
    req.session.authenticated = true;
    req.session.user_type = user.user_type;
    req.session.email = user.email;
    req.session.name = user.username; // Store user's name in the session
    req.session.birthdate = user.birthdate;
    req.session.cookie.maxAge = expireTime;
    req.session.userId = user._id;
    console.log("User ID: " + req.session.userId);
    return res.redirect("/");
  } else {
    // Incorrect password
    return res.render("loginError");
  }
});

app.get("/itemDetail", sessionValidation, (req, res) => {
  const item = {
    itemName: "Name",
    userName: "User 2",
    itemDescription: "Brief description",
    itemCategory: "Category",
  };
  res.render("itemDetail", item);
});

//Create Groups page
app.get("/createAGroup", sessionValidation, (req, res) => {
  res.render("createAGroup");
});

//Signup form posts the form fields and validates all inputs
app.post("/createAGroupSubmit", sessionValidation, async (req, res) => {
  var groupname = req.body.groupname;
  var groupdescription = req.body.groupdescription;
  var grouplocation = req.body.grouplocation;
  var userIdAdmin = req.session.userId;

  const schema = Joi.object({
    groupname: Joi.string().max(50).required(),
    groupdescription: Joi.string().max(500).required(),
    grouplocation: Joi.string().max(100).required(),
  });

  const validationResult = schema.validate({
    groupname,
    groupdescription,
    grouplocation,
  });

  if (validationResult.error != null) {
    //Sends an error message saying which field was missing
    console.log(validationResult.error);

    var error = validationResult.error.details[0].context.label;
    var errormessage = error.charAt(0).toUpperCase() + error.slice(1);

    res.render("submitErrorGroup", { errormessage: errormessage });
  } else {
    try {
      const newGroup = {
        groupname: groupname,
        groupdescription: groupdescription,
        grouplocation: grouplocation,
        createdBy: userIdAdmin,
        members: [userIdAdmin],
      };

      await groupCollection.insertOne(newGroup);

      console.log("Group Created:" + groupname);

      res.redirect("/groups");
    } catch (err) {
      console.error(err); // Log the error
      res.status(500).send({ message: "Server error" }); // Send an error response
    }
  }
});

// Group Profile page
app.get('/groupProfile/:groupId', sessionValidation, async (req, res) => {
    const groupId = req.params.groupId; // Get the group ID from the route parameter

    console.log(groupId);

    const groups = await groupCollection.findOne({ _id: new mongodb.ObjectId(groupId) });

    groups.groupname = groups.groupname.charAt(0).toUpperCase() + groups.groupname.slice(1);

    if (!groups) {
        // If no group was found, send a 404 error
        return res.status(404).send({ message: 'Group not found' });
    }

    // Render the groupProfile page with the group data
    res.render('groupProfile', { groups: groups, isMember: groups.members.includes(req.session.userId) });
});

app.post('/groupProfile/:groupId/join', sessionValidation, async (req, res) => {
    const groupId = req.params.groupId; // Get the group ID from the route parameter
    const userId = req.session.userId; // Get the user ID from the session

    // Add the user to the group
    await groupCollection.updateOne(
        { _id: new mongodb.ObjectId(groupId) },
        { $addToSet: { members: userId } }
    );

    // Redirect the user back to the group profile page
    res.redirect('/groupProfile/' + groupId);
});


app.use(express.static(__dirname + "/public"));

app.get("*", (req, res) => {
  res.status(404);
  res.render("404");
});

app.listen(port, () => {
  console.log("Node application listening on port " + port);
});

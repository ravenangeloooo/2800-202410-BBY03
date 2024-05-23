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
const ratingCollection = database.db(mongodb_database).collection('ratings');

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

  let items = await itemCollection
  .find({ user_id: { $ne: user_id } })
  .toArray();

  res.render("index", { items: items });
});

app.get("/requests", sessionValidation, async (req, res) => {
  let user_id = req.session.userId;

  let requests = await requestCollection
    .find({ user_id: { $ne: user_id } })
    .toArray();

  res.render("requests", { requests: requests });
  

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

    // Get the referer URL
    const backUrl = req.headers.referer || '/';
    console.log(backUrl);

    res.render('itemDetail', { item: item, backUrl: backUrl });
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

app.get("/editItem", sessionValidation, async (req, res) => {
  console.log("Query parameters: ", req.query);

  let item_id = req.query.id;
  console.log("Item ID: ", item_id);

  let item = await itemCollection.findOne({ _id: new mongodb.ObjectId(item_id) });
  console.log("Fetched item: ", item);
  
  res.render("editItem", { item: item });
});

app.get("/editRequest", sessionValidation, async (req, res) => {
  console.log("Query parameters: ", req.query);

  let request_id = req.query.id;
  console.log("Item ID: ", request_id);

  let request = await requestCollection.findOne({ _id: new mongodb.ObjectId(request_id) });
  console.log("Fetched Request: ", request);
  
  res.render("editRequest", { request: request });
});

app.post("/updateItem", sessionValidation, upload.single('image'), async (req, res) => {
  console.log("Request body: ", req.body);

  let item_id = req.body.item_id;
  let title = req.body.title;
  let description = req.body.description;
  let visibility = req.body.visibility;

  let updateData = { title: title, description: description, visibility: visibility };

  if (req.file) {
    let image_uuid = uuid(); // Generate a new UUID for the new image

    // Convert the image buffer to base64
    let buf64 = req.file.buffer.toString('base64');

    // Upload the new image to Cloudinary
    cloudinary.uploader.upload("data:image/octet-stream;base64," + buf64, async function (result) {
      // Update the image_id in the updateData object
      updateData.image_id = image_uuid;

      // Update the item in the database with the new data
      await itemCollection.updateOne(
        { _id: new mongodb.ObjectId(item_id) },
        { $set: updateData }
      );

      console.log("Item Updated:" + title);
      res.redirect("/collections"); // maybe include a modal?
    }, { public_id: image_uuid });
  } else {
    // If no new image is uploaded, just update the item with the new data
    await itemCollection.updateOne(
      { _id: new mongodb.ObjectId(item_id) },
      { $set: updateData }
    );

    console.log("Item Updated:" + title);
    res.redirect("/collections"); // maybe include a modal?
  }
});

app.post("/updateRequest", sessionValidation, async (req, res) => {
  console.log("Request body: ", req.body);

  let request_id = req.body.request_id;
  let title = req.body.title;
  let description = req.body.description;
  let visibility = req.body.visibility;

  // Update the request in the database with the new data
  let updateData = { title: title, description: description, visibility: visibility };
  await requestCollection.updateOne(
    { _id: new mongodb.ObjectId(request_id) },
    { $set: updateData }
  );

  console.log("Request Updated:" + title);
  res.redirect("/myRequests"); // maybe include a modal?
});

app.post("/items/:id/delete", async (req, res) => {
  let itemId = req.params.id;

  // Delete the item from the database
  await itemCollection.deleteOne({ _id: new mongodb.ObjectId(itemId) });

  console.log("Item Deleted:" + itemId);
  res.redirect("/collections");
});

app.post("/requests/:id/delete", async (req, res) => {
  let requestId = req.params.id;

  // Delete the request from the database
  await requestCollection.deleteOne({ _id: new mongodb.ObjectId(requestId) });

  console.log("Request Deleted:" + requestId);
  res.redirect("/myRequests");
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
    .project({ groupname: 1, _id: 1, image_id: 1, createdBy: 1})
    .toArray();
  console.log(result);

  // Field to each group indicating whether the user in session is the creator of the group
  result.forEach((group) => {
    group.isCreatedByUser = group.createdBy.toString() === userId.toString();
  });

  // Sort the groups based on whether the user in session is the creator of the group
  result.sort((a, b) => b.isCreatedByUser - a.isCreatedByUser);

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


app.get("/postItem", sessionValidation, async (req, res) => {
    // Get the user ID from the session
    const userId = req.session.userId;

    // Fetch the groups the user is a member of from the database
    const groups = await groupCollection
    .find({ members: { $in: [userId] } })
    .project({ groupname: 1, _id: 1 })
    .toArray();

    console.log(groups);

    // Render the createItem page with the groups
  res.render("postItem", { groups: groups });
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



app.get("/postRequest", sessionValidation, async(req, res) => {
  // Get the user ID from the session
  const userId = req.session.userId;

  // Fetch the groups the user is a member of from the database
  const groups = await groupCollection
  .find({ members: { $in: [userId] } })
  .project({ groupname: 1, _id: 1 })
  .toArray();

  console.log(groups);

  // Render the createItem page with the groups
  res.render("postRequest", { groups: groups });
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
  let user_id = req.session.userId;

  // Find groups that the user is not a member of
  const result = await groupCollection
    .find({ members: { $ne: user_id } })
    .project({ groupname: 1, _id: 1, image_id: 1 })
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

//DELETE LATER
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


//Signup form posts the form fields and validates all inputs with images
app.post('/createAGroupSubmit', sessionValidation, upload.single('image'), function (req, res, next) {
  let image_uuid = uuid();
  let groupname = req.body.groupname;
  let groupdescription = req.body.groupdescription;
  let grouplocation = req.body.grouplocation;
  let userIdAdmin = req.session.userId;

  // let pet_id = req.body.pet_id;
  // let user_id = req.body.user_id;
  let buf64 = req.file.buffer.toString('base64');

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
      stream = cloudinary.uploader.upload("data:image/octet-stream;base64," + buf64, async function (result) {

      const newGroup = {
        image_id: image_uuid,
        groupname: groupname,
        groupdescription: groupdescription,
        grouplocation: grouplocation,
        createdBy: userIdAdmin,
        members: [userIdAdmin],
      };

      await groupCollection.insertOne(newGroup);

      console.log("Group Created:" + groupname);
    },
    { public_id: image_uuid } );

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

    groupname = groups.groupname.charAt(0).toUpperCase() + groups.groupname.slice(1);

    let user_id = req.session.userId;

    let items = await itemCollection.find({ user_id: { $ne: user_id }, visibility: groupname  }).toArray();
    console.log(items);

    if (!groups) {
        // If no group was found, send a 404 error
        return res.status(404).send({ message: 'Group not found' });
    }

    // Get the referer URL
    const backUrl = req.headers.referer || '/';

    // Render the groupProfile page with the group data
    res.render('groupProfile', { groups: groups, isMember: groups.members.includes(req.session.userId), items: items, backUrl: backUrl});
});

// Group Profile page for requests
app.get('/groupProfile/:groupId/requests', sessionValidation, async (req, res) => {
  const groupId = req.params.groupId; // Get the group ID from the route parameter

  console.log(groupId);

  const groups = await groupCollection.findOne({ _id: new mongodb.ObjectId(groupId) });

  groupname = groups.groupname.charAt(0).toUpperCase() + groups.groupname.slice(1);

  let user_id = req.session.userId;

  let requests = await requestCollection.find({ user_id: { $ne: user_id }, visibility: groupname  }).toArray();
  console.log(requests);

  if (!groups) {
      // If no group was found, send a 404 error
      return res.status(404).send({ message: 'Group not found' });
  }

  // Get the referer URL
  const backUrl = req.headers.referer || '/';

  // Render the groupProfile page with the group data
  res.render('groupProfileRequests', { groups: groups, isMember: groups.members.includes(req.session.userId), requests: requests, backUrl: backUrl});
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


//Other User Profile page
app.get('/userProfile/:userProfileId', sessionValidation, async (req, res) => {
  const userProfileId = req.params.userProfileId; // Get the group ID from the route parameter

  console.log(userProfileId);

  const users = await userCollection.findOne({ _id: new mongodb.ObjectId(userProfileId) });

  // let user_id = req.session.userId;

  if (!users) {
    // If no group was found, send a 404 error
    return res.status(404).send({ message: 'Group not found' });
  }

  let ratings = await ratingCollection.find({ userProfileId: new mongodb.ObjectId(userProfileId) }).toArray();
  console.log(ratings);

  // Calculate the average rating to display on the user's profile
  let averageRating = 0;

  if (ratings.length > 0) {
    let sum = 0;

    for (let rating of ratings) {
      sum += Number(rating.value);
    }

  console.log(sum);
  averageRating = sum / ratings.length;
  }
  
  // Get the referer URL
  const backUrl = req.headers.referer || '/';
  console.log(backUrl);

  // Render the groupProfile page with the group data
  res.render('userProfile', { users: users, ratings: ratings, averageRating: averageRating, backUrl: backUrl});
});


// Rate User page
app.get('/userProfile/:userProfileId/rateUser', sessionValidation, async (req, res) => {
  const userProfileId = req.params.userProfileId; // Get the group ID from the route parameter
  const userId = req.session.userId; // Get the current user's ID from the session

  console.log(userProfileId);
  console.log(userId);

  if (userProfileId === userId) {
    // If the user is trying to rate themselves, send an error message
    return res.status(400).send({ message: 'You cannot rate yourself' });
  }

  const users = await userCollection.findOne({ _id: new mongodb.ObjectId(userProfileId) });

  if (!users) {
      // If no group was found, send a 404 error
      return res.status(404).send({ message: 'Group not found' });
  }

  // Get the referer URL
  const backUrl = req.headers.referer || '/';
  console.log(backUrl);

  // Render the groupProfile page with the group data
  res.render('userRating', { users: users, backUrl: backUrl});
});


// Submit user rating
app.post('/userProfile/:userProfileId/submitRating', sessionValidation, async (req, res) => {
    const userProfileId = req.params.userProfileId; // Get the user ID from the route parameter
    const userId = req.session.userId; // Get the current user's ID from the session
    const ratingValue = req.body.rating; // Get the rating from the request body
    const ratingEmoji = req.body.emoji; // Get the emoji from the request body

    // Fetch the user from your database
    const user = await userCollection.findOne({ _id: new mongodb.ObjectId(userId) });

    
    if (!user) {
      // If no user was found, send a 404 error
      return res.status(404).send({ message: 'User not found' });
  }

    // Create a new rating document
    const newRating = {
    userProfileId: new mongodb.ObjectId(userProfileId),
    ratedBy: new mongodb.ObjectId(userId),
    value: ratingValue,
    emoji: ratingEmoji
    
  };

    // Insert the new rating into the ratingCollection
    await ratingCollection.insertOne(newRating);

    // Redirect to the user's profile
    res.redirect(`/userProfile/${userProfileId}`);
});



app.use(express.static(__dirname + "/public"));

app.get("*", (req, res) => {
  res.status(404);
  res.render("404");
});

app.listen(port, () => {
  console.log("Node application listening on port " + port);
});

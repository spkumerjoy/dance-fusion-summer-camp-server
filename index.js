const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res
            .status(401)
            .send({ error: true, message: "unauthorized access" });
    }
    // bearer token
    const token = authorization.split(" ")[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res
                .status(401)
                .send({ error: true, message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
    });
};

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.0tlqdqn.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const classesCollection = client
            .db("danceFusionDB")
            .collection("classes");
        const usersCollection = client.db("danceFusionDB").collection("users");
        const selectedClassesCollection = client
            .db("danceFusionDB")
            .collection("selectedClasses");

        app.post("/jwt", (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: "1h",
            });

            res.send({ token });
        });

        //classes related apis
        app.get("/classes", async (req, res) => {
            const result = await classesCollection.find().toArray();
            res.send(result);
        });

        app.post("/classes", async (req, res) => {
            const newClass = req.body;
            const result = await classesCollection.insertOne(newClass);
            res.send(result);
        });

        app.get("/classes/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };

            const options = {
                projection: {
                    image: 1,
                    name: 1,
                    available_seats: 1,
                    price: 1,
                    feedback: 1,
                },
            };

            const result = await classesCollection.findOne(query, options);
            res.send(result);
        });

        app.put("/classes/:id", async (req, res) => {
            const id = req.params.id;
            const classes = req.body;
            const filter = { _id: new ObjectId(id) };
            const options = { upsert: true };
            const updatedClass = {
                $set: {
                    name: classes.name,
                    available_seats: parseInt(classes.available_seats),
                    price: parseFloat(classes.price),
                    feedback: classes?.feedback,
                },
            };
            const result = await classesCollection.updateOne(
                filter,
                updatedClass,
                options
            );
            res.send(result);
        });

        app.put("/classes/feedback/:id", async (req, res) => {
            const id = req.params.id;
            const classes = req.body;
            const filter = { _id: new ObjectId(id) };
            const options = { upsert: true };
            const updatedClass = {
                $set: {
                    feedback: classes?.feedback,
                },
            };
            const result = await classesCollection.updateOne(
                filter,
                updatedClass,
                options
            );
            res.send(result);
        });

        app.patch("/classes/approved/:id", async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: { status: "approved" },
            };

            const result = await classesCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        app.patch("/classes/deny/:id", async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: { status: "deny" },
            };

            const result = await classesCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        //user related apis
        app.get("/users", async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        });

        app.post("/users", async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await usersCollection.findOne(query);

            if (existingUser) {
                return res.send({ message: "user already exists" });
            }

            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        app.get("/users/admin/:email", verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ admin: false });
            }

            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const result = { admin: user?.role === "admin" };
            res.send(result);
        });

        app.patch("/users/admin/:id", async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: { role: "admin" },
            };

            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        app.patch("/users/instructor/:id", async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: { role: "instructor" },
            };

            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        //students classes apis
        app.get("/selected-classes", async (req, res) => {
            const result = await selectedClassesCollection.find().toArray();
            res.send(result);
        });

        app.post("/selected-classes", async (req, res) => {
            const selectedClasses = req.body;
            console.log(selectedClasses);
            const result = await selectedClassesCollection.insertOne(
                selectedClasses
            );
            res.send(result);
        });

        app.delete("/selected-classes/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await selectedClassesCollection.deleteOne(query);
            res.send(result);
        });

        //create payment intent
        app.post("/create-payment-intent", async (req, res) => {
            const { price } = req.body;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ["card"],
            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log(
            "Pinged your deployment. You successfully connected to MongoDB!"
        );
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get("/", (req, res) => {
    res.send("The server is running");
});

app.listen(port, () => {
    console.log(`The server is running on port ${port}`);
});

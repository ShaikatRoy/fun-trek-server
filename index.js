const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access' });
    }
    const token = authorization.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: 'unauthorized access' });
        }
        req.decoded = decoded;
        next();
    });
};

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.d8mhnco.mongodb.net/?retryWrites=true&w=majority`;

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
        // await client.connect();

        const usersCollection = client.db('funtrekDB').collection('users');
        const classesCollection = client.db('funtrekDB').collection('classes');
        const cartCollection = client.db('funtrekDB').collection('carts');
        const paymentCollection = client.db('funtrekDB').collection('payments');


        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '1h',
            });

            res.send({ token });
        });

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ error: true, message: 'forbidden message' });
            }
            next();
        };

        const verifyInstructor = async (req, res, next) => {
            if (!req.decoded || !req.decoded.email) {
                return res.status(401).send({ error: true, message: 'Unauthorized access' });
            }

            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            if (!user || user.role !== 'instructor') {
                return res.status(401).send({ error: true, message: 'Unauthorized access' });
            }
            next();
        };



        // users related APIs
        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        });

        app.post('/users', async (req, res) => {
            const user = req.body;
            console.log(user);
            const query = { email: user.email };
            const existingUser = await usersCollection.findOne(query);
            console.log('existingUser', existingUser);
            if (existingUser) {
                return res.send({ message: 'User already exists' });
            }
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        // classes related APIs

        // Get all classes
        app.get('/classes', async (req, res) => {
            try {
                console.log('Fetching classes...'); 

                const classes = await classesCollection.find().toArray();
                console.log('Classes:', classes);

                res.send(classes);
            } catch (error) {
                console.error('Failed to fetch classes:', error);
                res.status(500).send({ error: true, message: 'Failed to fetch classes' });
            }
        });


        // Create a class
        app.post('/classes', verifyJWT, verifyInstructor, async (req, res) => {
            const newClass = req.body;

            try {
                const result = await classesCollection.insertOne(newClass);
                res.send(result);
            } catch (error) {
                res.status(500).send({ error: true, message: 'Failed to create class' });
            }
        });


        // Update class status
        app.patch('/classes/:id/status', verifyJWT, verifyAdmin, async (req, res) => {
            const classId = req.params.id;
            const { status } = req.body;

            const filter = { _id: new ObjectId(classId) };
            const updateDoc = {
                $set: { status }
            };

            try {
                const result = await classesCollection.updateOne(filter, updateDoc);
                res.send(result);
            } catch (error) {
                res.status(500).send({ error: true, message: 'Failed to update class status' });
            }
        });

        // Send feedback for a class
        app.post('/classes/:id/feedback', verifyJWT, async (req, res) => {
            const classId = req.params.id;
            const { feedback } = req.body;

            const filter = { _id: new ObjectId(classId) };
            const updateDoc = {
                $set: { feedback },
            };

            try {
                const result = await classesCollection.updateOne(filter, updateDoc);
                res.send(result);
            } catch (error) {
                res.status(500).send({ error: true, message: 'Failed to send feedback' });
            }
        });

        // admin related APIs

        app.get('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ admin: false });
            }

            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const result = { admin: user?.role === 'admin' };
            res.send(result);
        });

        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'admin',
                },
            };
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        // instructor related APIs

        app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ instructor: false });
            }

            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const result = { instructor: user?.role === 'instructor' };
            res.send(result);
        });

        app.patch('/users/instructor/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'instructor',
                },
            };
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        app.get('/instructors', verifyJWT, async (req, res) => {
            const query = { role: 'instructor' };
            const instructors = await usersCollection.find(query).toArray();
            res.send(instructors);
        });

        // cart collection apis
        app.get('/carts', async (req, res) => {
            const email = req.query.email;
            console.log(email)
            if(!email){
                res.send([]);
            }
            const query = { email: email }
            const result = await cartCollection.find(query).toArray();
            res.send(result);
        })

        app.post('/carts', async (req, res) => {
            const item = req.body;
            console.log(item);
            const result = await cartCollection.insertOne(item);
            res.send(result);
        })

        app.delete('/carts/:id', async(req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id)};
            const result = await cartCollection.deleteOne(query);
            res.send(result);
          })

          

        // create payment intent
        app.post('/create-payment-intent', verifyJWT, async(req, res) => {
            const {price} = req.body;
            const amount = price*100;
            console.log(price, amount)
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        // payment related apis
        app.get("/carts/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await cartCollection.findOne(query);
            res.send(result);
          });

        app.post('/payments', async(req, res) => {
            const payment = req.body;
            const result = await paymentCollection.insertOne(payment);
            res.send(result)
        })

       

        
        // Send a ping to confirm a successful connection
        await client.db('admin').command({ ping: 1 });
        console.log('Pinged your deployment. You successfully connected to MongoDB!');
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('fun trek server is running ');
});

app.listen(port, () => {
    console.log(`fun trek server is running on port ${port}`);
});

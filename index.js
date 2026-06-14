const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
dotenv.config();

const uri = process.env.MONGODB_URI;
const app = express();
const PORT = process.env.PORT;
app.use(cors());
app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db = client.db("mediqueue");
    const tutorCollection = db.collection("tutors");
    const bookingCollection = db.collection("bookings");

    app.get("/tutor", async (req, res) => {
      const result = await tutorCollection.find().toArray();
      res.json(result);
    });

    app.get("/tutors/:id", async (req, res) => {
      const { id } = req.params;
      const result = await tutorCollection.findOne({ _id: new ObjectId(id) });

      res.json(result);
    });

    app.get("/bookings", async (req, res) => {
      const email = req.query.email;
      const result = await bookingCollection
        .find({ studentEmail: email })
        .toArray();
      res.send(result);
    });

    app.get("/my-tutors", async (req, res) => {
      const email = req.query.email;

      const result = await tutorCollection.find({ email }).toArray();

      res.send(result);
    });

    app.post("/bookings", async (req, res) => {
      const bookingData = req.body;

      const result = await bookingCollection.insertOne(bookingData);

      res.send(result);
    });

    app.post("/book-session", async (req, res) => {
      const bookingData = req.body;

      const tutor = await tutorCollection.findOne({
        _id: new ObjectId(bookingData.tutorId),
      });

      if (!tutor) {
        return res.status(404).send({
          message: "Tutor not found",
        });
      }

      if (tutor.totalSlot <= 0) {
        return res.status(400).send({
          message: "No available slots left",
        });
      }

      await bookingCollection.insertOne(bookingData);

      await tutorCollection.updateOne(
        {
          _id: new ObjectId(bookingData.tutorId),
        },
        {
          $inc: {
            totalSlot: -1,
          },
        },
      );

      res.send({
        success: true,
        message: "Booking successful",
      });
    });

    app.post("/tutor", async (req, res) => {
      const tutorData = req.body;

      const result = await tutorCollection.insertOne({
        ...tutorData,
        email: tutorData.email,
      });

      res.json(result);
    });

    app.delete("/tutors/:id", async (req, res) => {
      try {
        const { id } = req.params;

        const result = await tutorCollection.deleteOne({
          _id: new ObjectId(id),
        });

        res.send({
          success: true,
          message: "Tutor deleted successfully",
          result,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Delete failed" });
      }
    });

    app.patch("/bookings/:id", async (req, res) => {
      try {
        const { id } = req.params;

        const booking = await bookingCollection.findOne({
          _id: new ObjectId(id),
        });

        if (booking.bookStatus === "cancelled") {
          return res.status(400).send({ message: "Already cancelled" });
        }

        const result = await bookingCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: { bookStatus: "cancelled" },
          },
        );
        await tutorCollection.updateOne(
          { _id: new ObjectId(booking.tutorId) },
          {
            $inc: {
              totalSlot: 1,
            },
          },
        );
        res.send({
          success: true,
          message: "Booking cancelled",
          result,
        });
      } catch (error) {
        console.error(error);
      }
    });

    app.patch("/tutors/:id", async (req, res) => {
      const { id } = req.params;

      const result = await tutorCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: req.body,
        },
      );

      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is running fine!");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

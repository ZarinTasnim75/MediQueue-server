const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
dotenv.config();

const uri = process.env.MONGODB_URI;
const app = express();
const PORT = process.env.PORT || 5000;
const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET ;

app.use(cors({
  origin: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  credentials: true,
}));
app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
function generateToken(user) {
  const payload = {
    id: user._id || user.id,
    email: user.email,
    name: user.name,
    role: user.role || "user",
  };
  return jwt.sign(payload, BETTER_AUTH_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, BETTER_AUTH_SECRET);
  } catch (error) {
    return null;
  }
}
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Invalid token format. Use Bearer token." });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }

  req.user = decoded;
  next();
};

async function run() {
  try {
    await client.connect();

    const db = client.db("mediqueue");
    const tutorCollection = db.collection("tutors");
    const bookingCollection = db.collection("bookings");
    const userCollection = db.collection("users");
    
    app.post("/auth/get-token", async (req, res) => {
      try {
        const { email } = req.body;

        if (!email) {
          return res.status(400).json({ error: "Email is required." });
        }

        const user = await userCollection.findOne({ email });
        
        if (!user) {
          return res.status(404).json({ error: "User not found." });
        }

        const token = generateToken({
          _id: user._id,
          email: user.email,
          name: user.name,
          role: user.role || "user",
        });

        res.json({
          success: true,
          token,
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role || "user",
          },
        });
      } catch (error) {
        console.error("Get token error:", error);
        res.status(500).json({ error: "Failed to generate token." });
      }
    });
    app.post("/auth/register", async (req, res) => {
      try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
          return res.status(400).json({ error: "All fields are required." });
        }

        const existingUser = await userCollection.findOne({ email });
        if (existingUser) {
          return res.status(400).json({ error: "User already exists with this email." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = {
          name,
          email,
          password: hashedPassword,
          role: "user",
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await userCollection.insertOne(newUser);

        const token = generateToken({
          _id: result.insertedId,
          email,
          name,
          role: "user",
        });

        res.status(201).json({
          success: true,
          message: "User registered successfully",
          token,
          user: {
            id: result.insertedId,
            name,
            email,
            role: "user",
          },
        });
      } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ error: "Registration failed. Please try again." });
      }
    });

    app.post("/auth/login", async (req, res) => {
      try {
        const { email, password } = req.body;

        if (!email || !password) {
          return res.status(400).json({ error: "Email and password are required." });
        }

        const user = await userCollection.findOne({ email });
        if (!user) {
          return res.status(401).json({ error: "Invalid email or password." });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
          return res.status(401).json({ error: "Invalid email or password." });
        }

        const token = generateToken({
          _id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
        });

        res.json({
          success: true,
          message: "Login successful",
          token,
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
          },
        });
      } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: "Login failed. Please try again." });
      }
    });

    app.post("/auth/social-login", async (req, res) => {
      try {
        const { email, name, photo, provider, providerId } = req.body;

        if (!email || !provider || !providerId) {
          return res.status(400).json({ error: "Missing required fields." });
        }

        let user = await userCollection.findOne({ email });

        if (!user) {
          const newUser = {
            name: name || "User",
            email,
            photo: photo || "",
            role: "user",
            emailVerified: true,
            password: "",
            socialLogins: { [provider]: providerId },
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          const result = await userCollection.insertOne(newUser);
          user = { ...newUser, _id: result.insertedId };
        } else {
          await userCollection.updateOne(
            { _id: user._id },
            {
              $set: {
                emailVerified: true,
                [`socialLogins.${provider}`]: providerId,
                photo: photo || user.photo,
                name: name || user.name,
                updatedAt: new Date(),
              },
            }
          );
          user = await userCollection.findOne({ _id: user._id });
        }

        const token = generateToken({
          _id: user._id,
          email: user.email,
          name: user.name,
          role: user.role || "user",
        });

        res.json({
          success: true,
          message: "Social login successful",
          token,
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role || "user",
            photo: user.photo,
          },
        });
      } catch (error) {
        console.error("Social login error:", error);
        res.status(500).json({ error: "Social login failed." });
      }
    });
    
app.get("/tutor", async (req, res) => {
  try {
    const { 
      limit, 
      search, 
      startDate, 
      endDate 
    } = req.query;
    let query = {};
    if (search && search.trim() !== "") {
      query.tutorName = { 
        $regex: search.trim(), 
        $options: "i"
      };
    }
    if (startDate || endDate) {
      query.createdAt = {};
      
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endDateTime;
      }
    }
    
    let result;
    if (limit) {
      const limitNum = parseInt(limit);
      result = await tutorCollection
        .find(query)
        .limit(Math.min(limitNum, 100))
        .toArray();
    } else {
      result = await tutorCollection
        .find(query)
        .toArray();
    }
    res.json(result);
    
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tutors." });
  }
});
    app.get("/tutors/:id", authenticateJWT, async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: "Invalid tutor ID." });
        }
        const result = await tutorCollection.findOne({ _id: new ObjectId(id) });
        if (!result) {
          return res.status(404).json({ error: "Tutor not found." });
        }
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: "Server error." });
      }
    });

app.get("/bookings", authenticateJWT, async (req, res) => {
    try {
        const email = req.query.email || req.user.email;
        
        const result = await bookingCollection
            .find({ studentEmail: email })
            .sort({ createdAt: -1 })
            .toArray();
        res.json(result);
    } catch (error) {
        res.json([]);
    }
});
app.get("/my-tutors", authenticateJWT, async (req, res) => {
  try {
    const email = req.user.email;
    const result = await tutorCollection.find({ 
      email: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } 
    }).toArray();
    res.json(result);
  } catch (error) {
    res.json([]);
  }
});
    app.post("/bookings", authenticateJWT, async (req, res) => {
      try {
        const bookingData = {
          ...req.body,
          studentEmail: req.user.email,
          studentId: req.user.id,
          studentName: req.user.name,
          createdAt: new Date(),
        };
        const result = await bookingCollection.insertOne(bookingData);
        res.status(201).json({ success: true, bookingId: result.insertedId });
      } catch (error) {
        res.status(500).json({ error: "Failed to create booking." });
      }
    });

app.post("/book-session", authenticateJWT, async (req, res) => {
  try {
    if (!req.body.tutorId) {
      return res.status(400).json({ message: "Missing tutorId" });
    }
    
    if (!req.body.studentEmail) {
      req.body.studentEmail = req.user.email;
    }
    
    if (!req.body.studentName) {
      req.body.studentName = req.user.name;
    }

    const bookingData = {
      tutorId: req.body.tutorId,
      tutorName: req.body.tutorName || "Unknown Tutor",
      studentEmail: req.body.studentEmail || req.user.email,
      studentName: req.body.studentName || req.user.name,
      studentId: req.user.id,
      phone: req.body.phone || "",
      bookStatus: "confirmed",
      createdAt: new Date(),
    };

    // Check tutor exists
    const tutor = await tutorCollection.findOne({_id: new ObjectId(bookingData.tutorId),});

    if (!tutor) {
      return res.status(404).json({ message: "Tutor not found." });
    }

    if (tutor.totalSlot <= 0) {
      return res.status(400).json({ message: "No available slots left." });
    }
    const result = await bookingCollection.insertOne(bookingData);
    await tutorCollection.updateOne(
      { _id: new ObjectId(bookingData.tutorId) },
      { $inc: { totalSlot: -1 } }
    );

    res.status(201).json({ 
      success: true, 
      message: "Booking successful!",
      bookingId: result.insertedId 
    });

  } catch (error) {
    res.status(500).json({ 
      error: "Failed to book session.",
      details: error.message 
    });
  }
});

    app.post("/tutor", authenticateJWT, async (req, res) => {
      try {
        const tutorData = {
          ...req.body,
          email: req.user.email,
          createdBy: req.user.id,
          createdAt: new Date(),
        };
        const result = await tutorCollection.insertOne(tutorData);
        res.status(201).json({ success: true, tutorId: result.insertedId });
      } catch (error) {
        res.status(500).json({ error: "Failed to add tutor." });
      }
    });

    app.delete("/tutors/:id", authenticateJWT, async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: "Invalid tutor ID." });
        }
        const result = await tutorCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
          return res.status(404).json({ error: "Tutor not found." });
        }
        res.json({ success: true, message: "Tutor deleted successfully" });
      } catch (error) {
        res.status(500).json({ error: "Delete failed." });
      }
    });

    app.patch("/bookings/:id", authenticateJWT, async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: "Invalid booking ID." });
        }

        const booking = await bookingCollection.findOne({ _id: new ObjectId(id) });
        if (!booking) {
          return res.status(404).json({ message: "Booking not found." });
        }
        if (booking.bookStatus === "cancelled") {
          return res.status(400).json({ message: "Already cancelled." });
        }

        await bookingCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { bookStatus: "cancelled" } }
        );
        await tutorCollection.updateOne(
          { _id: new ObjectId(booking.tutorId) },
          { $inc: { totalSlot: 1 } }
        );

        res.json({ success: true, message: "Booking cancelled" });
      } catch (error) {
        console.error("Error cancelling booking:", error);
        res.status(500).json({ error: "Failed to cancel booking." });
      }
    });

    app.patch("/tutors/:id", authenticateJWT, async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: "Invalid tutor ID." });
        }
        const result = await tutorCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: req.body }
        );
        if (result.matchedCount === 0) {
          return res.status(404).json({ error: "Tutor not found." });
        }
        res.json({ success: true, message: "Tutor updated" });
      } catch (error) {
        res.status(500).json({ error: "Failed to update tutor." });
      }
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
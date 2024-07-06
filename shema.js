const mongoose=require('mongoose')
const shema= mongoose.Schema
const UsernameShema=new shema({
    username: {
        type:String,
        require: true
    }
},{timestamps:true})

const Chatapp=mongoose.model('Chatapp',UsernameShema)
module.exports=Chatapp
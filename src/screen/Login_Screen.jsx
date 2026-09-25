import { Image, StyleSheet, Text, View } from 'react-native'
import React from 'react'

const Login_Screen = () => {
  return (
    <View style={styles.container}>
     <view style = {styles.topImagecontainer}>
        <image source={required("../assets/images/top_vector.png")} styles={styles.topImage}/>
     </view>
    </View>
  )
}

export default Login_Screen

const styles = StyleSheet.create({container: {
    backgroundColor: '#fff',
    flex:1,
},
    topImagecontainer:{
    height:50,
}
    topImage:{
    Width:"100%",   
    height:50, 
},
})
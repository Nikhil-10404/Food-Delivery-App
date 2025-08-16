import SignIn from "@/app/(auth)/sign-in";
import { CreateUserPrams, SignInParams } from "@/type";
import { Account, Avatars, Client, Databases, ID, Query } from "react-native-appwrite";

export const appwriteConfig = {
  endpoint: process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT as string, // must be string
  platform: "com.yognik.fooddelivery",
  databaseId: "689f4cf400382bb1fa55",
  userCollectionId: "689f515a000fa3336a47",
  projectId: process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID as string,
};

export const client = new Client();

client
  .setEndpoint(appwriteConfig.endpoint!) // API endpoint
  .setProject(appwriteConfig.projectId!) // project ID
  .setPlatform(appwriteConfig.platform); // REQUIRED for react-native-appwrite

  export const account=new Account(client)
  export const databases=new Databases(client);
  const avatars=new Avatars(client);

  export const createUser =async({email,password,name}:CreateUserPrams)=>{
    try{
         const newAccount=await account.create(ID.unique(),email,password,name)
         if(!newAccount)throw Error;

         await signIn({email,password});

         const avatarUrl=avatars.getInitialsURL(name);

         return await databases.createDocument(
            appwriteConfig.databaseId,
            appwriteConfig.userCollectionId,
            ID.unique(),
            {   accountId:newAccount.$id,
                email,name,
                avatar:avatarUrl
            }
            
         )
    }catch(e){
        throw new Error(e as string)

    }
  }
   export const signIn=async({email,password}:SignInParams)=>{
          try{
         const session=await account.createEmailPasswordSession(email,password);
          }catch(e){
            throw new Error(e as string)
          }
    }

    export const getCurrentUser=async()=>{
        try{
            const currentAccount=await account.get();
            if(!currentAccount)throw Error;

            const currentUser=await databases.listDocuments(
                appwriteConfig.databaseId,
                appwriteConfig.userCollectionId,
                [Query.equal('accountId',currentAccount.$id)]
            )
            if(!currentUser)throw Error;
            return currentUser.documents[0];

        }catch(e){
            console.log(e);
            throw new Error(e as string);
        }
    }

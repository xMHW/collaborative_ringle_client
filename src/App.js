import React, {useEffect, useRef, useState} from 'react';
import './App.css';
import {useParams} from "react-router-dom";
import {ApiHelper} from './modules/ApiHelper.js';
import Card from './components/Card.js';
import { io } from 'socket.io-client';
import useDidMountEffect from './modules/usedidmounteffect';


const SOCKET_URL = "http://54.180.147.138:5000"
const DEFAULT_URL = "http://54.180.147.138"
// const SOCKET_URL = "http://54.180.147.138:5000"

const App = () => {
  const [tree, setTree] = useState([]);
  const [currentCard, setCurrentCard] = useState(null);
  const [load, setLoad] = useState(false);
  const [locRefs, setlocRefs] = useState([]);
  const {userId} = useParams();
  const [backSpace, setBackSpace] = useState(false);
  const [mergePending, setMergePending] = useState(null);
  const [cardCreated, setCardCreated] = useState(false);
  const [goingUp, setGoingUp] = useState(false);
  const [socket, setSocket] = useState();
  const [treeDifference, setTreeDifference] = useState(false);
  const [treeCardCount, setTreeCardCount] = useState(0);


  useEffect(() => {
    getTree();
  }, []);

  useEffect(() => {
    if(checkTreeDifference(tree.length)) setTreeDifference(true);
    setTreeCardCount(tree.length);
  }, [tree]);

  const checkTreeDifference = (length) => {
    if(treeCardCount != length) return true;
    return false;
  };

  useEffect(() => {
    const s = io(SOCKET_URL);
    setSocket(s);

    return () => {
      s.disconnect();
    }
  },[]);

  useDidMountEffect(() => {
    if (socket == null || tree == null || treeDifference == false) return;
    socket.emit("send-tree-changes", {delta: tree, id: userId});
    setTreeDifference(true);
  }, [socket, tree, treeDifference]);

  useDidMountEffect(() => {
    if (socket == null || tree == null) return;
    const handler = (deltamap) => {
      if(deltamap["id"] == userId) return;
      setTree(deltamap["delta"]);
    };
    socket.on("receive-tree-changes", handler);
  }, [socket, tree]);

  const createLoc = async () => {
    const response = await ApiHelper(`${DEFAULT_URL}/loc/create`, null, 'POST', {
      refs: [],
    })
  }

  //????????? ????????? ?????? ???, ??????/?????? ?????? ????????????????
  const createTree = async () => {
    const response = await ApiHelper(`${DEFAULT_URL}/tree/create`, null, 'POST', {
      cards: [],
      page: 0,
    })
  }

  //?????? ????????? ????????? ?????? ????????????, tree???????????? uuid??? ???????????? ??????
  const getTree = async () => {
    const response = await ApiHelper(`${DEFAULT_URL}/tree/find/all`, null, 'GET', null)
    // console.log(response)
    setTree(response[0].cards)
    // console.log(tree)
  }

  const validateTree = async (tree) => {
    const allCards = await ApiHelper(`${DEFAULT_URL}/card/find/all`, null, 'GET', null)
    // console.log(allCards);
    let result = allCards.map(({_id}) => _id)
    // console.log(result)
    for (var i = 0; i < tree.length; i++){
      if (result.indexOf(tree[i]) === -1){
        let indexOfSplice = tree.indexOf(tree[i]);
        tree.splice(indexOfSplice, 1);
        // console.log("Splicing", tree[i]);
      }
      // console.log("validating cards while updating")
    }
    const validatedTree = tree;
    setTree(validatedTree)
  }

  const updateTree = async (page, tree) => {
    //page??? cards ????????????
    validateTree(tree);
    const response = await ApiHelper(`${DEFAULT_URL}/tree/update`, null, 'POST', {
      page: page,
      cards: ["608b3f2157e25818a1d3ff16","608b3f3557e25818a1d3ff17"],
    })
    // console.log("updating tree")
    // console.log(response)
  }

  // console.log(tree)

  const findPrevCard = (uuid, actionType) => {
    const index = tree.indexOf(uuid)
    if (index === -1){
      return
    }
    if (index === 0){
      return
    }
    //??? ?????? ???????????? ????????? uuid????????????
    setCurrentCard(tree[index-1]);
    setGoingUp(true);

    // if(actionType === "delete"){
    //   const copied = [...tree]
    //   copied.splice(index, 1);
    //   setTree(copied);
    //   //tree ???????????? ????????? ????????? -> !!!!!!!!!!!!!!!!!!
    // }
  }

  const findNextCard = (uuid) => {
    const index = tree.indexOf(uuid)
    if (index === -1){
      console.log("That card uuid is Invalid!!!!!!!")
      return
    }
    if (!tree[index+1]){
      console.log("There is no Card After this one!!!!!")
      return
    }
    //??? ?????? ????????? ?????? ????????? uuid ????????????
    console.log("Nothing went wrong!")
    setCurrentCard(tree[index + 1]);
  }

  const createdCard = (createdId) => {
    const index = tree.indexOf(currentCard);
    let newTree = []
    if(index === -1){
      newTree = [
        ...tree, createdId
      ]
      setTree(newTree)
    }else{
      const copiedTree = [...tree]
      copiedTree.splice(index + 1, 0, 
        createdId
      );
      newTree= copiedTree;
      setTree(newTree);
    }

    updateTree(1, newTree);
    //????????? ???????????? ???????????? ?????? ???????????? ???!!!!!!!!!
  }
  
  const deleteCurrentCardFromTree = () => {
    const index = tree.indexOf(currentCard);
    setCurrentCard(tree[index-1]);
    let newTree = []
    if(index === -1){
      return
    }else{
      const copiedTree = [...tree]
      copiedTree.splice(index, 1);
      newTree = copiedTree;
      setTree(newTree)
    }
    updateTree(1, newTree);
  }




  return <>
  <div style = {{padding:16, width:1100, backgroundColor: 'white', maxWidth:1100, borderRadius:8, display: 'inline-block'}}>
    {
      tree.map((id) => <Card key={id}
      // initContentState = {obj.initContentState}
      uuid = {id}
      currentCard = {currentCard}
      findPrevCard = {findPrevCard}
      findNextCard = {findNextCard}
      createdNewCardAtTree = {createdCard}
      setCurrentCard = {setCurrentCard}
      deleteCurrentCardFromTree = {deleteCurrentCardFromTree}
      setBackSpace = {setBackSpace}
      backSpace = {backSpace}
      mergePending = {mergePending}
      setMergePending = {setMergePending}
      cardCreated = {cardCreated}
      setCardCreated = {setCardCreated}
      goUp = {goingUp}
      setGoUp = {setGoingUp}
      socket = {socket}
      setSocket = {setSocket}
    />)
    }
    </div>
    
    
    </>
}

export default App;
// createNewCard={add} 
// findPrevCard={findPrevCard}
// findNextCard={findNextCard}
// updateId={updateId}
// updateData={updateData}
// initContentState = {obj.initContentState}

// {/* <div onClick = {createTree}>TreeCreate</div> */}
/* <div className = "superFancyBlockQuote" ref = {thisRef} contentEditable = {true} placeholder = "write">
    
    </div> */

// <div onClick = {printRef}>  Print Typed Content</div>
// <div onClick = {updating}>  Update Ref</div>
// <div onClick = {removing}>  Remove Ref</div>
